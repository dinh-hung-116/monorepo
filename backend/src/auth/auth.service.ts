import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { PublicUser, User } from './entities/user.entity.js';

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly users: Map<string, User> = new Map();
  private userCounter = 1;

  constructor(private readonly jwtService: JwtService) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = Array.from(this.users.values()).find(
      (u) => u.email === normalizedEmail,
    );
    if (existing) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const id = `user-${this.userCounter++}`;
    const user: User = {
      id,
      email: normalizedEmail,
      name: dto.name?.trim() || normalizedEmail.split('@')[0],
      passwordHash,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
    };

    this.users.set(id, user);
    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = Array.from(this.users.values()).find(
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

  findById(userId: string): PublicUser | undefined {
    const user = this.users.get(userId);
    if (!user) return undefined;
    return this.toPublicUser(user);
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
