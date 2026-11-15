// Barista: đổi trạng thái đơn qua máy trạng thái, chặn nhảy cóc, chặn 2 người bấm cùng lúc.
import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffGuard } from '../auth/staff.guard.js';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

interface Row {
  id: number;
  order_code: string;
  user_id: number;
  status: string;
  total_price: string;
  created_at: Date;
  items: unknown[];
}

describe('OrdersService — barista cập nhật trạng thái', () => {
  let service: OrdersService;
  let row: Row;
  let releaseForOrder: ReturnType<typeof vi.fn>;
  let updateMany: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    row = {
      id: 9,
      order_code: '#1009',
      user_id: 3,
      status: 'PAID',
      total_price: '45000',
      created_at: new Date(),
      items: [],
    };
    // Giống UPDATE ... WHERE id = ? AND status = ? của PostgreSQL: so trạng thái rồi ghi, không xen kẽ.
    updateMany = vi.fn(
      async (args: { where: { status: string }; data: { status: string } }) => {
        if (row.status !== args.where.status) return { count: 0 };
        row = { ...row, status: args.data.status };
        return { count: 1 };
      },
    );
    findMany = vi.fn(async () => [row]);
    releaseForOrder = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      orders: {
        findUnique: vi.fn(async () => ({ ...row })),
        findMany,
        updateMany,
      },
    } as unknown as PrismaService;
    service = new OrdersService(prisma, {
      releaseForOrder,
    } as unknown as InventoryService);
  });

  it('đi đủ luồng PAID → PREPARING → READY → COMPLETED', async () => {
    expect((await service.updateStatusByStaff('#1009', 'PREPARING')).status).toBe(
      'PREPARING',
    );
    expect((await service.updateStatusByStaff('1009', 'READY')).status).toBe(
      'READY',
    );
    expect((await service.updateStatusByStaff('#1009', 'COMPLETED')).status).toBe(
      'COMPLETED',
    );
  });

  it('nhảy cóc PAID → READY bị chặn 409, không ghi DB', async () => {
    await expect(
      service.updateStatusByStaff('#1009', 'READY'),
    ).rejects.toThrow(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('không huỷ được đơn đang pha chế', async () => {
    row.status = 'PREPARING';
    await expect(
      service.updateStatusByStaff('#1009', 'CANCELLED'),
    ).rejects.toThrow(ConflictException);
  });

  it('huỷ đơn PAID thì trả lại nguyên liệu', async () => {
    const result = await service.updateStatusByStaff('#1009', 'CANCELLED');
    expect(result.status).toBe('CANCELLED');
    expect(releaseForOrder).toHaveBeenCalledWith(9);
  });

  it('2 barista cùng bấm "Nhận đơn" → chỉ 1 người thành công', async () => {
    const results = await Promise.allSettled([
      service.updateStatusByStaff('#1009', 'PREPARING'),
      service.updateStatusByStaff('#1009', 'PREPARING'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(row.status).toBe('PREPARING');
  });

  it('mã đơn không tồn tại → 404', async () => {
    const prisma = {
      orders: { findUnique: vi.fn(async () => null) },
    } as unknown as PrismaService;
    await expect(
      new OrdersService(prisma).updateStatusByStaff('#9999', 'PREPARING'),
    ).rejects.toThrow(NotFoundException);
  });

  it('hàng đợi chỉ lấy PAID, PREPARING, READY, cũ nhất trước', async () => {
    const queue = await service.findStaffQueue();
    expect(queue[0].orderCode).toBe('#1009');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['PAID', 'PREPARING', 'READY'] } },
        orderBy: { id: 'asc' },
      }),
    );
  });
});

describe('StaffGuard — chỉ nhân viên dùng được API barista', () => {
  const contextFor = (userId: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }),
    }) as unknown as ExecutionContext;

  const guardWithRole = (role: string) =>
    new StaffGuard({
      users: { findUnique: vi.fn(async () => ({ role })) },
    } as unknown as PrismaService);

  it('khách hàng (CUSTOMER) bị 403', async () => {
    await expect(
      guardWithRole('CUSTOMER').canActivate(contextFor('3')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('STAFF được phép', async () => {
    await expect(guardWithRole('STAFF').canActivate(contextFor('2'))).resolves.toBe(
      true,
    );
  });
});
