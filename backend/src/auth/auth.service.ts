// Task 7.1: Quản lý người dùng, băm mật khẩu bcrypt và xác thực (Tùng phụ trách).
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

export interface AuthResponse {
  accessToken: string;
  user: {
    id: number;
    email: string;
    name: string;
    phone: string | null;
    role: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Task 7.1: Băm mật khẩu an toàn với bcrypt (salt rounds = 10). */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /** Task 7.1: So khớp mật khẩu người dùng nhập với hash trong DB. */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /** Đăng ký tài khoản mới: kiểm tra email trùng, băm mật khẩu, lưu vào DB. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.users.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new BadRequestException('Email này đã được sử dụng.');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.prisma.users.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        password_hash: passwordHash,
        name: dto.name.trim(),
        phone: dto.phone?.trim() ?? null,
      },
    });

    const token = this.generateToken(user.id, user.email, user.role);
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  /** Đăng nhập: kiểm tra email, đối chiếu mật khẩu, cấp JWT token. */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
    }

    const isMatch = await this.comparePassword(dto.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
    }

    const token = this.generateToken(user.id, user.email, user.role);
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  /** Phát JWT token chứa payload định danh người dùng. */
  private generateToken(userId: number, email: string, role: string): string {
    return this.jwtService.sign({ sub: userId, email, role });
  }
}

