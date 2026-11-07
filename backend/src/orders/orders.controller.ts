import {
  Body,
  Controller,
  Get,
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

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrder(
    @Req() req: AuthenticatedRequest,
    @Body() createOrderDto: CreateOrderDto,
  ): Order {
    return this.ordersService.createOrder(req.user.userId, createOrderDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyOrders(@Req() req: AuthenticatedRequest): Order[] {
    return this.ordersService.findByUser(req.user.userId);
  }
}
