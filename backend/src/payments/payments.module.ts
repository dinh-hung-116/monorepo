import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsSchedulerService } from "./payments-scheduler.service.js";

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsSchedulerService],
  exports: [PaymentsService],
})
export class PaymentsModule {}