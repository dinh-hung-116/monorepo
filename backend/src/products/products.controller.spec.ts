import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

// Task 2.2: kiểm tra route HTTP và status code với service giả lập.
describe('ProductsController (HTTP)', () => {
  let app: INestApplication;
  const latte = { id: 4, name: 'Latte', description: '', price: 35000, imageUrl: '', category: 'Cà phê' };
  const service = {
    findAll: vi.fn().mockResolvedValue([latte]),
    findOne: vi.fn(async (id: number) => {
      if (id !== 4) throw new NotFoundException();
      return latte;
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('GET /products → 200 + mảng sản phẩm', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    expect(res.body).toEqual([latte]);
  });

  it('GET /products/4 → 200 + chi tiết', async () => {
    const res = await request(app.getHttpServer()).get('/products/4').expect(200);
    expect(res.body.name).toBe('Latte');
  });

  it('GET /products/999 → 404', async () => {
    await request(app.getHttpServer()).get('/products/999').expect(404);
  });

  it('GET /products/abc → 400 (id phải là số)', async () => {
    await request(app.getHttpServer()).get('/products/abc').expect(400);
    expect(service.findOne).not.toHaveBeenCalledWith('abc');
  });
});
