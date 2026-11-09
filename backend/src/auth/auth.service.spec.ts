import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService (Task 7.1)', () => {
  let authService: AuthService;
  let findUniqueMock: ReturnType<typeof vi.fn>;
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findUniqueMock = vi.fn();
    createMock = vi.fn();

    const prismaMock = {
      users: {
        findUnique: findUniqueMock,
        create: createMock,
      },
    } as unknown as PrismaService;

    const jwtMock = {
      signAsync: vi.fn().mockResolvedValue('mock_jwt_token_123'),
    } as unknown as JwtService;

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
    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      password_hash: 'hashed',
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      role: 'CUSTOMER',
      loyalty_points: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const res = await authService.register({
      email: 'test@example.com',
      password: 'password123',
      name: 'Nguyễn Văn A',
      phone: '0901234567',
    });

    expect(res.accessToken).toBe('mock_jwt_token_123');
    expect(res.user.email).toBe('test@example.com');
    expect(res.user.phone).toBe('0901234567');
  });

  it('register ném ConflictException nếu email đã tồn tại', async () => {
    findUniqueMock.mockResolvedValue({ id: 99 });
    await expect(
      authService.register({
        email: 'exist@example.com',
        password: 'password123',
        name: 'Ai đó',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('login thất bại nếu sai email hoặc mật khẩu', async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(
      authService.login({
        email: 'notfound@example.com',
        password: '123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
