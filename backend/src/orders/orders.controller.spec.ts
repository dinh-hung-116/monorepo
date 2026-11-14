import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import {PaymentsService} from "../payments/payments.service.js";

describe('OrdersController', () => {
  let ordersController: OrdersController;

  beforeEach(async () => {
    let orderIdSeq = 1;
    const prismaMock = {
      // users mock để createOrderInDb kiểm tra foreign key
      users: {
        findUnique: vi.fn(async () => ({ id: 1 })),
      },
      orders: {
        count: vi.fn(async () => orderIdSeq - 1),
        // findUnique để kiểm tra trùng order_code
        findUnique: vi.fn(async () => null),
        create: vi.fn(
          async ({
            data,
          }: {
            data: {
              order_code: string;
              user_id: number | null;
              status: string;
              total_price: number;
              items: {
                create: Array<{
                  product_id: string;
                  product_name: string;
                  size: string;
                  toppings: string[];
                  price: number;
                  quantity: number;
                  subtotal: number;
                }>;
              };
            };
          }) => {
            const id = orderIdSeq++;
            const now = new Date();
            return {
              id,
              order_code: data.order_code,
              user_id: data.user_id,
              status: data.status,
              total_price: new Prisma.Decimal(data.total_price),
              customer_name: null,
              customer_phone: null,
              address: null,
              note: null,
              created_at: now,
              updated_at: now,
              items: data.items.create.map((it, idx) => ({
                id: idx + 1,
                order_id: id,
                product_id: it.product_id,
                product_name: it.product_name,
                size: it.size,
                toppings: it.toppings,
                price: new Prisma.Decimal(it.price),
                quantity: it.quantity,
                subtotal: new Prisma.Decimal(it.subtotal),
              })),
            };
          },
        ),
        findMany: vi.fn(async () => []),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        PaymentsService,
        OrdersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    ordersController = moduleRef.get<OrdersController>(OrdersController);
  });

  it('should create an order in PENDING status and return orderCode and calculated total', async () => {
    const mockReq = {
      user: {
        userId: '1',
        email: 'customer@brewlite.vn',
      },
    } as unknown as Request & { user: AuthenticatedUser };

    const order = await ordersController.createOrder(mockReq, {
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
    expect(order.userId).toBe('1');
    expect(order.total).toBe(123000);
    expect(order.items).toHaveLength(2);
    expect(order.items[0].lineTotal).toBe(45000);
    expect(order.items[1].lineTotal).toBe(78000);
  });
});
