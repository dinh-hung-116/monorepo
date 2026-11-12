import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import type { Order } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createOrder(
    @Req() req: AuthenticatedRequest,
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<Order> {
    return this.ordersService.createOrder(req.user.userId, createOrderDto);
  }

  @Post('validate-promotion')
  async validatePromotion(@Body() body: { code?: string; subtotal?: number }) {
    if (
      !body.code?.trim() ||
      typeof body.subtotal !== 'number' ||
      body.subtotal < 0
    ) {
      throw new BadRequestException(
        'Mã khuyến mãi và tổng tiền hợp lệ là bắt buộc',
      );
    }
    return this.ordersService.validatePromotion(body.code, body.subtotal);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyOrders(@Req() req: AuthenticatedRequest): Promise<Order[]> {
    return this.ordersService.findByUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':code')
  async getOrderByCode(@Param('code') code: string): Promise<Order> {
    return this.ordersService.findByCode(code);
  }

  /** Khách huỷ đơn của mình khi đang chờ thanh toán / thanh toán lỗi. */
  @UseGuards(JwtAuthGuard)
  @Post(':code/cancel')
  async cancelOrder(
    @Req() req: AuthenticatedRequest,
    @Param('code') code: string,
  ): Promise<void> {
     await Promise.all([
         this.ordersService.cancelOrder(code, req.user.userId),
         this.paymentsService.cancelPayment(code, req.user.userId),
    ]);
  }
}
