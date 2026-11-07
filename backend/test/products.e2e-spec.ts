// Task 2.3: kiểm thử API sản phẩm với database thật và thời gian phản hồi < 500ms.
// Cần PostgreSQL đã chạy, đã `npm run db:migrate` và `npm run db:seed`. Chạy: npm run test:e2e
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

const LIMIT_MS = 500;

describe('Products API (e2e)', () => {
  let app: INestApplication<App>;

  /** Gọi GET path, kiểm tra status và trả về body cùng thời gian phản hồi (ms). */
  async function timedGet(path: string, status: number) {
    const start = performance.now();
    const res = await request(app.getHttpServer()).get(path).expect(status);
    return { body: res.body as unknown, ms: performance.now() - start };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    // Lần gọi đầu mở kết nối tới database, không tính vào thời gian phản hồi
    await request(app.getHttpServer()).get('/products');
  });
  afterAll(() => app.close());

  it(`GET /products → 200, ít nhất 4 món, đủ id, tên, giá, ảnh, < ${LIMIT_MS}ms`, async () => {
    const { body, ms } = await timedGet('/products', 200);
    const products = body as Record<string, unknown>[];
    expect(products.length).toBeGreaterThanOrEqual(4);
    for (const p of products) {
      expect(p).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
          price: expect.any(Number),
          imageUrl: expect.any(String),
        }),
      );
    }
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`GET /products/:id → 200 đúng món, < ${LIMIT_MS}ms`, async () => {
    const list = (await timedGet('/products', 200)).body as { id: number; name: string }[];
    const { body, ms } = await timedGet(`/products/${list[0].id}`, 200);
    expect(body).toMatchObject({ id: list[0].id, name: list[0].name });
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('GET /products/999999 → 404 khi món không tồn tại', async () => {
    await timedGet('/products/999999', 404);
  });

  it('GET /products/abc → 400 khi id không phải số', async () => {
    await timedGet('/products/abc', 400);
  });

  it(`20 lần gọi GET /products liên tiếp, lần nào cũng < ${LIMIT_MS}ms`, async () => {
    for (let i = 0; i < 20; i++) {
      const { ms } = await timedGet('/products', 200);
      expect(ms).toBeLessThan(LIMIT_MS);
    }
  });
});
