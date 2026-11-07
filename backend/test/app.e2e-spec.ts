import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('BrewLite API (e2e) - Task 6 & Task 7', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('POST /auth/register & POST /auth/login should register user and issue JWT', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'testuser@brewlite.vn',
        password: 'password123',
        name: 'Test User',
      })
      .expect(201);

    expect(registerRes.body.accessToken).toBeDefined();
    expect(registerRes.body.user.email).toBe('testuser@brewlite.vn');

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'testuser@brewlite.vn',
        password: 'password123',
      })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('POST /orders should reject unauthenticated requests with 401 (Guard protection)', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({
        items: [
          {
            productId: 'cappuccino',
            size: 'M',
            qty: 1,
            unitPrice: 45000,
          },
        ],
      })
      .expect(401);
  });

  it('POST /orders should validate cart payload using class-validator (400 on invalid input)', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'validator@brewlite.vn',
        password: 'password123',
      })
      .expect(201);

    const token = reg.body.accessToken as string;

    // Empty items array
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [] })
      .expect(400);

    // Invalid size & negative qty
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productId: 'cappuccino',
            size: 'XL',
            qty: 0,
            unitPrice: 45000,
          },
        ],
      })
      .expect(400);
  });

  it('POST /orders should create PENDING order and return orderCode when authenticated with valid cart', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'orderuser@brewlite.vn',
        password: 'password123',
      })
      .expect(201);

    const token = reg.body.accessToken as string;

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productId: 'cappuccino',
            productName: 'Cappuccino',
            size: 'M',
            toppings: ['Kem'],
            qty: 1,
            unitPrice: 45000,
          },
          {
            productId: 'tra-dao',
            productName: 'Trà đào',
            size: 'L',
            toppings: ['Trân châu'],
            qty: 2,
            unitPrice: 39000,
          },
        ],
      })
      .expect(201);

    expect(orderRes.body.status).toBe('PENDING');
    expect(orderRes.body.orderCode).toBe('#1001');
    expect(orderRes.body.total).toBe(123000);
    expect(orderRes.body.items).toHaveLength(2);
  });
});
