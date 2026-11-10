import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { PublicUser, User } from './entities/user.entity.js';

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  phone?: string | null;
  role?: string;
  loyalty_points?: number;
  created_at?: Date | string;
  updated_at?: Date | string;
}

interface UsersDelegate {
  findUnique(args: {
    where: { email?: string; id?: number };
  }): Promise<UserRow | null>;
  create(args: {
    data: {
      email: string;
      name: string;
      phone?: string | null;
      password_hash: string;
      loyalty_points?: number;
    };
  }): Promise<UserRow>;
}

interface LocalDbData {
  userSeq: number;
  users: User[];
}

const LOCAL_DB_PATH = resolve(process.cwd(), '.data', 'users-db.json');

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    code === 'P2021' ||
    message.includes('does not exist in the current database')
  );
}

function isDatabaseUnavailableError(err: unknown): boolean {
  if (
    err instanceof ConflictException ||
    err instanceof UnauthorizedException
  ) {
    return false;
  }
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    name.includes('PrismaClientInitializationError') ||
    name.includes('PrismaClientRustPanicError') ||
    code === 'P1000' ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    code === 'P2021' ||
    message.includes("Can't reach database server") ||
    message.includes('Authentication failed against database server') ||
    message.includes('Environment variable not found: DATABASE_URL') ||
    message.includes('does not exist in the current database')
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly fallbackUsers: Map<string, User> = new Map();
  private fallbackCounter = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.loadFallbackFromDisk();
  }

  private get usersRepo(): UsersDelegate {
    const repo = (this.prisma as unknown as { users?: UsersDelegate })?.users;
    if (!repo) {
      const err = new Error("Can't reach database server");
      (err as { code?: string }).code = 'P1001';
      throw err;
    }
    return repo;
  }

  private isTestEnv(): boolean {
    return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  }

  private async ensureSchemaIfNeeded(err: unknown): Promise<boolean> {
    if (!isMissingTableError(err)) return false;
    const maybeEnsure = (
      this.prisma as unknown as { ensureSchema?: () => Promise<boolean> }
    )?.ensureSchema;
    if (typeof maybeEnsure === 'function') {
      return maybeEnsure.call(this.prisma);
    }
    return false;
  }

  private loadFallbackFromDisk(): void {
    if (this.isTestEnv()) return;
    try {
      if (!existsSync(LOCAL_DB_PATH)) return;
      const raw = readFileSync(LOCAL_DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as LocalDbData;
      if (Array.isArray(parsed?.users)) {
        for (const u of parsed.users) {
          this.fallbackUsers.set(u.id, u);
        }
      }
      if (typeof parsed?.userSeq === 'number' && parsed.userSeq > 0) {
        this.fallbackCounter = parsed.userSeq;
      }
    } catch {
      // Ignore disk read errors
    }
  }

  private saveFallbackToDisk(): void {
    if (this.isTestEnv()) return;
    try {
      mkdirSync(dirname(LOCAL_DB_PATH), { recursive: true });
      const payload: LocalDbData = {
        userSeq: this.fallbackCounter,
        users: Array.from(this.fallbackUsers.values()),
      };
      writeFileSync(LOCAL_DB_PATH, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Ignore disk write errors
    }
  }

  /** Task 7.1: Băm mật khẩu an toàn với bcrypt (salt rounds = 10). */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Task 7.1: So khớp mật khẩu người dùng nhập với hash trong DB. */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async registerInDb(
    normalizedEmail: string,
    displayName: string,
    phone: string | null,
    passwordHash: string,
  ): Promise<AuthResult> {
    const existing = await this.usersRepo.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const created = await this.usersRepo.create({
      data: {
        email: normalizedEmail,
        name: displayName,
        phone,
        password_hash: passwordHash,
        loyalty_points: 0,
      },
    });

    return this.buildAuthResult(this.rowToUser(created));
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const displayName = dto.name?.trim() || normalizedEmail.split('@')[0];
    const phone = dto.phone?.trim() ?? null;
    const passwordHash = await this.hashPassword(dto.password);

    try {
      return await this.registerInDb(
        normalizedEmail,
        displayName,
        phone,
        passwordHash,
      );
    } catch (err) {
      let finalErr: unknown = err;
      if (await this.ensureSchemaIfNeeded(err)) {
        try {
          return await this.registerInDb(
            normalizedEmail,
            displayName,
            phone,
            passwordHash,
          );
        } catch (retryErr) {
          finalErr = retryErr;
        }
      }

      if (!isDatabaseUnavailableError(finalErr)) {
        throw finalErr;
      }

      if (!this.isTestEnv()) {
        const msg =
          (finalErr as { message?: string })?.message ?? String(finalErr);
        this.logger.warn(
          `Lưu tài khoản vào PostgreSQL thất bại (${msg.split('\n')[0]}), đang lưu tạm vào .data/users-db.json.`,
        );
      }

      this.loadFallbackFromDisk();
      const existing = Array.from(this.fallbackUsers.values()).find(
        (u) => u.email === normalizedEmail,
      );
      if (existing) {
        throw new ConflictException('Email đã được đăng ký');
      }

      const id = String(this.fallbackCounter++);
      const user: User = {
        id,
        email: normalizedEmail,
        name: displayName,
        phone,
        role: 'CUSTOMER',
        passwordHash,
        loyaltyPoints: 0,
        createdAt: new Date().toISOString(),
      };

      this.fallbackUsers.set(id, user);
      this.saveFallbackToDisk();
      return this.buildAuthResult(user);
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    try {
      let row: UserRow | null;
      try {
        row = await this.usersRepo.findUnique({
          where: { email: normalizedEmail },
        });
      } catch (err) {
        if (await this.ensureSchemaIfNeeded(err)) {
          row = await this.usersRepo.findUnique({
            where: { email: normalizedEmail },
          });
        } else {
          throw err;
        }
      }

      if (!row) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      const isPasswordValid = await this.comparePassword(
        dto.password,
        row.password_hash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      return this.buildAuthResult(this.rowToUser(row));
    } catch (err) {
      if (!isDatabaseUnavailableError(err)) {
        throw err;
      }

      this.loadFallbackFromDisk();
      const user = Array.from(this.fallbackUsers.values()).find(
        (u) => u.email === normalizedEmail,
      );
      if (!user) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      const isPasswordValid = await this.comparePassword(
        dto.password,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      return this.buildAuthResult(user);
    }
  }

  async findById(userId: string): Promise<PublicUser | undefined> {
    const numericId = Number(userId);
    try {
      if (Number.isInteger(numericId) && numericId > 0) {
        const row = await this.usersRepo.findUnique({
          where: { id: numericId },
        });
        if (!row) return undefined;
        return this.toPublicUser(this.rowToUser(row));
      }
    } catch (err) {
      if (!isDatabaseUnavailableError(err)) {
        throw err;
      }
    }

    this.loadFallbackFromDisk();
    const user = this.fallbackUsers.get(userId);
    if (!user) return undefined;
    return this.toPublicUser(user);
  }

  private rowToUser(row: UserRow): User {
    const createdAt = row.created_at
      ? row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString()
      : new Date().toISOString();

    return {
      id: String(row.id),
      email: row.email,
      name: row.name,
      phone: row.phone ?? null,
      role: row.role ?? 'CUSTOMER',
      passwordHash: row.password_hash,
      loyaltyPoints: row.loyalty_points ?? 0,
      createdAt,
    };
  }

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role ?? 'CUSTOMER',
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? null,
      role: user.role ?? 'CUSTOMER',
      loyaltyPoints: user.loyaltyPoints,
      createdAt: user.createdAt,
    };
  }
}
