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
        const expirationTime = new Date(Date.now() - 3 * 60 * 1000);

        const result = await this.prisma.$transaction(async (tx) => {
            const expiredPayments = await tx.payments.updateMany({
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

            const expiredOrders = await tx.orders.updateMany({
                where: {
                    status: 'PENDING',
                    payments: {
                        some: {
                            status: PaymentStatus.FAILED,
                            created_at: {
                                lte: expirationTime,
                            },
                        },
                        none: {
                            status: PaymentStatus.PENDING,
                        },
                    },
                },
                data: {
                    status: 'CANCELLED',
                },
            });
            return expiredPayments;
        });

        this.logger.log(`Expired ${result.count} payments`);
    }
}