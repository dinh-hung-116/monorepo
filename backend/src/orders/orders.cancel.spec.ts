import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

interface FakeOrderRow {
  id: number;
  order_code: string;
  user_id: number | null;
  status: string;
  total_price: string;
  created_at: Date;
  items?: unknown[];
}

describe('OrdersService — huỷ đơn và đơn quá hạn', () => {
  let service: OrdersService;
  let releaseForOrder: ReturnType<typeof vi.fn>;
  let order: FakeOrderRow;
  let updateMock: ReturnType<typeof vi.fn>;
  let queryRawMock: ReturnType<typeof vi.fn>;

  const baseOrder = (): FakeOrderRow => ({
    id: 7,
    order_code: '#1007',
    user_id: 3,
    status: 'PENDING',
    total_price: '30000',
    created_at: new Date(),
    items: [],
  });

  beforeEach(() => {
    order = baseOrder();
    updateMock = vi.fn(async ({ data }: { data: { status: string } }) => {
      order = { ...order, ...data };
      return order;
    });
    // expireStalePendingOrders dùng raw SQL (mốc hạn tính bằng NOW() của PostgreSQL).
    queryRawMock = vi.fn().mockResolvedValue([]);
    releaseForOrder = vi.fn().mockResolvedValue(undefined);

    const prismaMock = {
      $queryRaw: queryRawMock,
      orders: {
        findUnique: vi.fn(async () => order),
        update: updateMock,
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const inventoryMock = { releaseForOrder } as unknown as InventoryService;
    service = new OrdersService(prismaMock, inventoryMock);
  });

  it('huỷ đơn PENDING của chính mình → CANCELLED và trả lại nguyên liệu', async () => {
    const result = await service.cancelOrder('#1007', '3');

    expect(result.status).toBe('CANCELLED');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: 'CANCELLED' },
    });
    expect(releaseForOrder).toHaveBeenCalledWith(7);
  });

  it('chấp nhận mã đơn không có dấu #', async () => {
    const result = await service.cancelOrder('1007', '3');
    expect(result.status).toBe('CANCELLED');
  });

  it('không cho huỷ đơn của người khác', async () => {
    await expect(service.cancelOrder('#1007', '99')).rejects.toThrow(
      ForbiddenException,
    );
    expect(releaseForOrder).not.toHaveBeenCalled();
  });

  it('không cho huỷ đơn đã thanh toán', async () => {
    order = { ...order, status: 'PAID' };
    await expect(service.cancelOrder('#1007', '3')).rejects.toThrow(
      ConflictException,
    );
    expect(releaseForOrder).not.toHaveBeenCalled();
  });

  it('mã đơn không tồn tại → 404', async () => {
    order = baseOrder();
    const prismaMock = {
      orders: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: updateMock,
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const localService = new OrdersService(prismaMock);

    await expect(localService.cancelOrder('#9999', '3')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('tự huỷ đơn PENDING quá hạn và trả lại nguyên liệu', async () => {
    queryRawMock.mockResolvedValue([
      { id: 11, order_code: '#1011' },
      { id: 12, order_code: '#1012' },
    ]);

    const cancelled = await service.expireStalePendingOrders(15);

    expect(cancelled).toBe(2);
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(releaseForOrder).toHaveBeenCalledWith(11);
    expect(releaseForOrder).toHaveBeenCalledWith(12);
  });

  it('không làm gì khi số phút không hợp lệ', async () => {
    expect(await service.expireStalePendingOrders(0)).toBe(0);
    expect(await service.expireStalePendingOrders(Number.NaN)).toBe(0);
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
