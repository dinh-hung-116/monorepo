import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';

describe('AuthService (Task 7.1 - Tùng)', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtMock: any;

  beforeEach(() => {
    prismaMock = {
      users: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };
    jwtMock = {
      sign: vi.fn().mockReturnValue('mock_jwt_token_123'),
    };
    authService = new AuthService(prismaMock, jwtMock);
  });

  it('hashPassword tạo ra chuỗi băm khác với mật khẩu gốc', async () => {
    const raw = 'secret123';
    const hash = await authService.hashPassword(raw);
    expect(hash).not.toBe(raw);
    expect(hash.length).toBeGreaterThan(20);

    const isMatch = await authService.comparePassword(raw, hash);
    expect(isMatch).toBe(true);

    const isWrong = await authService.comparePassword('wrongpassword', hash);
    expect(isWrong).toBe(false);
  });

  it('register thành công và trả về accessToken kèm thông tin user', async () => {
    prismaMock.users.findUnique.mockResolvedValue(null);
    prismaMock.users.create.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      password_hash: 'hashed',
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      role: 'CUSTOMER',
    });

    const res = await authService.register({
      email: 'test@example.com',
      password: 'password123',
      name: 'Nguyễn Văn A',
      phone: '0901234567',
    });

    expect(res.accessToken).toBe('mock_jwt_token_123');
    expect(res.user.email).toBe('test@example.com');
  });

  it('register ném BadRequestException nếu email đã tồn tại', async () => {
    prismaMock.users.findUnique.mockResolvedValue({ id: 99 });
    await expect(
      authService.register({
        email: 'exist@example.com',
        password: 'password123',
        name: 'Ai đó',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('login thất bại nếu sai email hoặc mật khẩu', async () => {
    prismaMock.users.findUnique.mockResolvedValue(null);
    await expect(
      authService.login({
        email: 'notfound@example.com',
        password: '123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

