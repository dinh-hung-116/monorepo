import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrderExpiryService } from './order-expiry.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import {PaymentsModule} from "../payments/payments.module.js";

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderExpiryService],
  exports: [OrdersService],
})
export class OrdersModule {}
