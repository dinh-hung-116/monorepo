// Tự huỷ đơn PENDING bỏ dở để nguyên liệu đã giữ chỗ không bị khoá vĩnh viễn.
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';

/** Số phút giữ chỗ mặc định cho một đơn chờ thanh toán. */
const DEFAULT_HOLD_MINUTES = 15;
/** Chu kỳ kiểm tra mặc định. */
const DEFAULT_INTERVAL_MS = 60_000;

@Injectable()
export class OrderExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly ordersService: OrdersService) {}

  onModuleInit(): void {
    // Không chạy nền trong test để kết quả không phụ thuộc thời gian.
    if (process.env.VITEST || process.env.NODE_ENV === 'test') return;

    const holdMinutes = Number(
      process.env.ORDER_HOLD_MINUTES ?? DEFAULT_HOLD_MINUTES,
    );
    if (!Number.isFinite(holdMinutes) || holdMinutes <= 0) {
      this.logger.warn(
        'ORDER_HOLD_MINUTES không hợp lệ — tắt chức năng tự huỷ đơn quá hạn',
      );
      return;
    }

    const rawInterval = Number(
      process.env.ORDER_EXPIRY_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
    );
    const intervalMs =
      Number.isFinite(rawInterval) && rawInterval >= 1000
        ? rawInterval
        : DEFAULT_INTERVAL_MS;

    this.timer = setInterval(() => {
      this.ordersService.expireStalePendingOrders(holdMinutes).catch((err) => {
        this.logger.error(
          `Kiểm tra đơn quá hạn thất bại: ${(err as Error)?.message ?? String(err)}`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();

    this.logger.log(
      `Tự huỷ đơn PENDING quá ${holdMinutes} phút, kiểm tra mỗi ${Math.round(intervalMs / 1000)}s`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
