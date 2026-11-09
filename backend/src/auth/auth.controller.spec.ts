import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JWT_SECRET } from './jwt.strategy.js';

interface MockUserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  loyalty_points: number;
  created_at: Date;
  updated_at: Date;
}

describe('AuthController', () => {
  let authController: AuthController;
  let storedUsers: MockUserRow[];

  beforeEach(async () => {
    storedUsers = [];
    let seq = 1;

    const prismaMock = {
      users: {
        findUnique: vi.fn(
          async ({ where }: { where: { email?: string; id?: number } }) => {
            if (where.email !== undefined) {
              return (
                storedUsers.find((u) => u.email === where.email) ?? null
              );
            }
            if (where.id !== undefined) {
              return storedUsers.find((u) => u.id === where.id) ?? null;
            }
            return null;
          },
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: {
              email: string;
              name: string;
              password_hash: string;
              loyalty_points?: number;
            };
          }) => {
            const now = new Date();
            const row: MockUserRow = {
              id: seq++,
              email: data.email,
              name: data.name,
              password_hash: data.password_hash,
              loyalty_points: data.loyalty_points ?? 0,
              created_at: now,
              updated_at: now,
            };
            storedUsers.push(row);
            return row;
          },
        ),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    authController = moduleRef.get<AuthController>(AuthController);
  });

  it('should register a new user in database, hash password, and return JWT accessToken', async () => {
    const result = await authController.register({
      email: 'customer@brewlite.vn',
      password: 'password123',
      name: 'Nguyen Van A',
    });

    expect(result.accessToken).toBeDefined();
    expect(typeof result.accessToken).toBe('string');
    expect(result.user.email).toBe('customer@brewlite.vn');
    expect(result.user.name).toBe('Nguyen Van A');
    expect(storedUsers).toHaveLength(1);
    expect(storedUsers[0].password_hash).not.toBe('password123');
    expect(
      (result.user as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
  });

  it('should reject duplicate email registration with ConflictException', async () => {
    await authController.register({
      email: 'dup@brewlite.vn',
      password: 'password123',
    });

    await expect(
      authController.register({
        email: 'dup@brewlite.vn',
        password: 'password456',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should login with valid credentials from database and return JWT accessToken', async () => {
    await authController.register({
      email: 'login@brewlite.vn',
      password: 'secretPassword',
    });

    const loginResult = await authController.login({
      email: 'login@brewlite.vn',
      password: 'secretPassword',
    });

    expect(loginResult.accessToken).toBeDefined();
    expect(loginResult.user.email).toBe('login@brewlite.vn');
  });

  it('should throw UnauthorizedException when password is wrong', async () => {
    await authController.register({
      email: 'wrongpass@brewlite.vn',
      password: 'correctPassword',
    });

    await expect(
      authController.login({
        email: 'wrongpass@brewlite.vn',
        password: 'wrongPassword',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
