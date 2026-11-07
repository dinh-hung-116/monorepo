import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let ordersController: OrdersController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [OrdersService],
    }).compile();

    ordersController = moduleRef.get<OrdersController>(OrdersController);
  });

  it('should create an order in PENDING status and return orderCode and calculated total', () => {
    const mockReq = {
      user: {
        userId: 'user-1',
        email: 'customer@brewlite.vn',
      },
    } as unknown as Request & { user: AuthenticatedUser };

    const order = ordersController.createOrder(mockReq, {
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
          productId: 'peach-tea',
          productName: 'Trà đào',
          size: 'L',
          toppings: ['Trân châu'],
          qty: 2,
          unitPrice: 39000,
        },
      ],
    });

    expect(order.id).toBe('order-1001');
    expect(order.orderCode).toBe('#1001');
    expect(order.status).toBe('PENDING');
    expect(order.userId).toBe('user-1');
    expect(order.total).toBe(123000);
    expect(order.items).toHaveLength(2);
    expect(order.items[0].lineTotal).toBe(45000);
    expect(order.items[1].lineTotal).toBe(78000);
  });
});
