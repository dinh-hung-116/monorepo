import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsSchedulerService } from './payments-scheduler.service.js';

describe('PaymentsSchedulerService', () => {
  let updateMany: ReturnType<typeof vi.fn>;
  let service: PaymentsSchedulerService;

  beforeEach(() => {
    updateMany = vi.fn().mockResolvedValue({ count: 1 });
    service = new PaymentsSchedulerService({
      payments: { updateMany },
    } as unknown as PrismaService);
    vi.stubEnv('ORDER_HOLD_MINUTES', '3');
  });

  it('chuyển payment PENDING sang FAILED sau khi quá thời gian thanh toán', async () => {
    const now = new Date('2026-11-12T07:00:00.000Z');
    vi.setSystemTime(now);

    await service.expirePendingPayments();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        created_at: {
          lte: new Date(now.getTime() - 3 * 60 * 1000),
        },
      },
      data: { status: 'FAILED' },
    });
  });
});
