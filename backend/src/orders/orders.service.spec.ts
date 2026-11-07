import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';

describe('OrdersService (Task 6.2 - Tùng)', () => {
  let ordersService: OrdersService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      products: {
        findMany: vi.fn(),
      },
      orders: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    ordersService = new OrdersService(prismaMock);
  });

  it('ném BadRequestException nếu giỏ hàng trống', async () => {
    await expect(ordersService.create({ items: [] })).rejects.toThrow(BadRequestException);
  });

  it('tạo đơn hàng thành công với trạng thái PENDING và tính đúng giá', async () => {
    // Giả sử có Cà phê sữa (id 2, giá gốc 25000)
    prismaMock.products.findMany.mockResolvedValue([
      { id: 2, name: 'Cà phê sữa', price: 25000, is_available: true },
    ]);

    // Khách đặt: Size M (+5000), Topping Trân châu (+7000) -> 1 ly = 37000 * 2 ly = 74000
    prismaMock.orders.create.mockImplementation(({ data }: any) => {
      return Promise.resolve({
        id: 10,
        order_code: data.order_code,
        status: data.status,
        total_price: data.total_price,
        created_at: new Date(),
        items: data.items.create,
      });
    });

    const res = await ordersService.create({
      items: [
        {
          productId: 2,
          size: 'M',
          toppings: ['tran-chau'],
          quantity: 2,
        },
      ],
      customerName: 'Tùng',
      customerPhone: '0987654321',
    });

    expect(res.status).toBe('PENDING');
    expect(res.orderCode).toMatch(/^BL-\d{6}-\d{4}$/);
    expect(res.totalPrice).toBe(74000);
    expect(res.itemCount).toBe(1);
  });
});

