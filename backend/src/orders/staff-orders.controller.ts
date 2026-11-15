// Barista: hàng đợi đơn và cập nhật trạng thái pha chế. Chỉ STAFF/ADMIN.
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StaffGuard } from '../auth/staff.guard.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import type { Order } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';

@Controller()
@UseGuards(JwtAuthGuard, StaffGuard)
export class StaffOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Đơn đang chờ quầy xử lý: PAID, PREPARING, READY (cũ nhất trước). */
  @Get('staff/orders')
  async queue(): Promise<Order[]> {
    return this.ordersService.findStaffQueue();
  }

  /** Barista chuyển đơn sang bước kế tiếp (hoặc huỷ đơn PAID). */
  @Patch('orders/:code/status')
  async updateStatus(
    @Param('code') code: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    return this.ordersService.updateStatusByStaff(code, dto.status);
  }
}
