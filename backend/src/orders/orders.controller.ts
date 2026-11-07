// Controller tiếp nhận yêu cầu đặt đơn hàng, bảo vệ bởi JwtAuthGuard (Tùng - Task 7.3).
import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /orders – Tạo đơn hàng mới từ giỏ hàng.
   * Yêu cầu xác thực JWT (Task 7.3).
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.ordersService.create(dto, userId);
  }

  /** GET /orders/:code – Xem thông tin đơn hàng theo mã đơn. */
  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.ordersService.findOne(code);
  }
}

