import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { users as UserRow } from '@prisma/client';
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

interface LocalDbData {
  userSeq: number;
  users: User[];
}

const LOCAL_DB_PATH = resolve(process.cwd(), '.data', 'users-db.json');

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
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    code === 'P2021' ||
    message.includes("Can't reach database server") ||
    message.includes('Environment variable not found: DATABASE_URL') ||
    message.includes('does not exist in the current database')
  );
}

@Injectable()
export class AuthService {
  private readonly fallbackUsers: Map<string, User> = new Map();
  private fallbackCounter = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.loadFallbackFromDisk();
  }

  private isTestEnv(): boolean {
    return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
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

  async register(dto: RegisterDto): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const displayName = dto.name?.trim() || normalizedEmail.split('@')[0];
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const existing = await this.prisma.users.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) {
        throw new ConflictException('Email đã được đăng ký');
      }

      const created = await this.prisma.users.create({
        data: {
          email: normalizedEmail,
          name: displayName,
          password_hash: passwordHash,
          loyalty_points: 0,
        },
      });

      return this.buildAuthResult(this.rowToUser(created));
    } catch (err) {
      if (!isDatabaseUnavailableError(err)) {
        throw err;
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
      const row = await this.prisma.users.findUnique({
        where: { email: normalizedEmail },
      });

      if (!row) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      const isPasswordValid = await bcrypt.compare(
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

      const isPasswordValid = await bcrypt.compare(
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
        const row = await this.prisma.users.findUnique({
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
    return {
      id: String(row.id),
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      loyaltyPoints: row.loyalty_points ?? 0,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };
  }

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const payload = { sub: user.id, email: user.email };
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
      loyaltyPoints: user.loyaltyPoints,
      createdAt: user.createdAt,
    };
  }
}
