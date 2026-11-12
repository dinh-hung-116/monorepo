import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumptionLine } from './inventory.calculator.js';
import { InventoryService } from './inventory.service.js';

// Validate đầu vào không chạm DB.
const prismaStub = {} as PrismaService;

const plan = (quantity: number): ConsumptionLine[] => [
  { ingredientId: 1, name: 'Cà phê rang xay', unit: 'g', quantity },
];

const row = (quantity: string, reserved: string, version: number) => ({
  id: 1,
  name: 'Cà phê rang xay',
  unit: 'g',
  quantity,
  reserved,
  version,
});

describe('InventoryService — validate kho', () => {
  const service = new InventoryService(prismaStub);

  it('từ chối số lượng tồn kho âm', async () => {
    await expect(service.setStock(1, -5)).rejects.toThrow(BadRequestException);
  });

  it('từ chối số lượng tồn kho không phải số', async () => {
    await expect(service.setStock(1, Number.NaN)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('từ chối nhập kho với số lượng <= 0', async () => {
    await expect(service.restock(1, 0)).rejects.toThrow(BadRequestException);
    await expect(service.restock(1, -10)).rejects.toThrow(BadRequestException);
  });
});

describe('InventoryService — optimistic locking khi giữ chỗ', () => {
  const makeTx = () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      order_ingredient_reservations: { create },
    } as unknown as Prisma.TransactionClient;
    return { tx, create };
  };

  it('thử lại khi UPDATE khớp 0 dòng (đụng version) rồi thành công', async () => {
    const service = new InventoryService(prismaStub);
    const { tx, create } = makeTx();
    vi.mocked(tx.$queryRaw)
      .mockResolvedValueOnce([row('100', '0', 0)])
      .mockResolvedValueOnce([row('82', '18', 1)]);
    vi.mocked(tx.$executeRaw)
      .mockResolvedValueOnce(0) // transaction khác vừa cập nhật → version lệch
      .mockResolvedValueOnce(1);

    await service.reserveInTransaction(tx, 7, plan(18));

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        order_id: 7,
        ingredient_id: 1,
        quantity: expect.objectContaining({}),
      },
    });
  });

  it('không đủ hàng thì báo 409 ngay, không UPDATE', async () => {
    const service = new InventoryService(prismaStub);
    const { tx, create } = makeTx();
    vi.mocked(tx.$queryRaw).mockResolvedValueOnce([row('10', '0', 3)]);

    await expect(service.reserveInTransaction(tx, 7, plan(18))).rejects.toThrow(
      ConflictException,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('đụng version liên tục quá số lần cho phép thì báo lỗi thử lại', async () => {
    const service = new InventoryService(prismaStub);
    const { tx, create } = makeTx();
    vi.mocked(tx.$queryRaw).mockResolvedValue([row('100', '0', 0)]);
    vi.mocked(tx.$executeRaw).mockResolvedValue(0);

    await expect(service.reserveInTransaction(tx, 7, plan(18))).rejects.toThrow(
      ConflictException,
    );
    expect(create).not.toHaveBeenCalled();
  });
});
