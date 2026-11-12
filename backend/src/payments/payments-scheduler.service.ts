import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentStatus } from "@prisma/client";

@Injectable()
export class PaymentsSchedulerService {
    private readonly logger = new Logger(PaymentsSchedulerService.name);

    constructor(private readonly prisma: PrismaService) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async expirePendingPayments() {
        const holdMinutes = Number(
            process.env.ORDER_HOLD_MINUTES ?? 15,
        );
        if (!Number.isFinite(holdMinutes) || holdMinutes <= 0) {
            this.logger.warn(
                'ORDER_HOLD_MINUTES không hợp lệ — tắt chức năng tự huỷ đơn quá hạn',
            );
            return;
        }
        const expirationTime = new Date(Date.now() - holdMinutes * 60 * 1000);

        const expiredPayments = await this.prisma.payments.updateMany({
            where: {
                status: 'PENDING',
                created_at: {
                    lte: expirationTime,
                },
            },
            data: {
                status: PaymentStatus.FAILED,
            },
        });

        this.logger.log(`Expired ${expiredPayments.count} payments`);
    }
}