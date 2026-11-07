import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JWT_SECRET } from './jwt.strategy.js';

describe('AuthController', () => {
  let authController: AuthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [AuthService],
    }).compile();

    authController = moduleRef.get<AuthController>(AuthController);
  });

  it('should register a new user, hash password, and return JWT accessToken', async () => {
    const result = await authController.register({
      email: 'customer@brewlite.vn',
      password: 'password123',
      name: 'Nguyen Van A',
    });

    expect(result.accessToken).toBeDefined();
    expect(typeof result.accessToken).toBe('string');
    expect(result.user.email).toBe('customer@brewlite.vn');
    expect(result.user.name).toBe('Nguyen Van A');
    expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
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

  it('should login with valid credentials and return JWT accessToken', async () => {
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
