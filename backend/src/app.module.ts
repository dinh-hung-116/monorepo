import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';
import { ToppingsModule } from './toppings/toppings.module.js';
import { ScheduleModule } from '@nestjs/schedule';


@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    ToppingsModule,
    AuthModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
