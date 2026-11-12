import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService (Task 6.2)', () => {
  let ordersService: OrdersService;
  let createMock: ReturnType<typeof vi.fn>;
  let countMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    countMock = vi.fn().mockResolvedValue(0);
    createMock = vi.fn();

    const prismaMock = {
      // users mock để createOrderInDb kiểm tra foreign key
      users: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      },
      orders: {
        count: countMock,
        create: createMock,
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    ordersService = new OrdersService(prismaMock);
  });

  it('ném BadRequestException nếu giỏ hàng trống', async () => {
    await expect(ordersService.createOrder('1', { items: [] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('tạo đơn hàng thành công với trạng thái PENDING và tính đúng tổng tiền', async () => {
    createMock.mockImplementation(
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
              product_id: number | null;
              product_name: string;
              size: string;
              price: number;
              quantity: number;
              subtotal: number;
              item_toppings?: { create: Array<{ topping_name: string }> };
            }>;
          };
        };
      }) => {
        const now = new Date();
        return {
          id: 1,
          order_code: data.order_code,
          user_id: data.user_id,
          status: data.status,
          total_price: new Prisma.Decimal(data.total_price),
          created_at: now,
          updated_at: now,
          items: data.items.create.map((it, idx) => ({
            id: idx + 1,
            order_id: 1,
            product_id: it.product_id,
            product_name: it.product_name,
            size: it.size,
            price: new Prisma.Decimal(it.price),
            quantity: it.quantity,
            subtotal: new Prisma.Decimal(it.subtotal),
            item_toppings: (it.item_toppings?.create ?? []).map((t) => ({
              topping_name: t.topping_name,
            })),
          })),
        };
      },
    );

    const res = await ordersService.createOrder('1', {
      items: [
        {
          productId: '2',
          productName: 'Cà phê sữa',
          size: 'M',
          toppings: ['Trân châu'],
          qty: 2,
          unitPrice: 37000,
        },
      ],
    });

    expect(res.status).toBe('PENDING');
    expect(res.orderCode).toBe('#1001');
    expect(res.total).toBe(74000);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].lineTotal).toBe(74000);
    // Topping lấy từ bảng order_item_toppings của schema mới
    expect(res.items[0].toppings).toEqual(['Trân châu']);
    // Schema mới đã bỏ customer_name/address/note khỏi bảng orders
    expect(res.customerName).toBeNull();
  });

  it('không tạo đơn khi tồn kho không đủ (409)', async () => {
    const assertPlanAvailable = vi
      .fn()
      .mockRejectedValue(new ConflictException('Không đủ nguyên liệu'));
    const inventoryMock = {
      planFor: vi.fn().mockResolvedValue([
        {
          ingredientId: 1,
          name: 'Cà phê rang xay',
          unit: 'g',
          quantity: 18,
        },
      ]),
      assertPlanAvailable,
      reserveInTransaction: vi.fn(),
    } as unknown as InventoryService;

    const prismaMock = {
      users: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      orders: {
        count: countMock,
        create: createMock,
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const service = new OrdersService(prismaMock, inventoryMock);

    await expect(
      service.createOrder('1', {
        items: [
          {
            productId: '2',
            productName: 'Cà phê sữa',
            size: 'M',
            toppings: [],
            qty: 1,
            unitPrice: 30000,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);

    expect(assertPlanAvailable).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });
});
