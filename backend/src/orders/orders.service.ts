import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { Order, OrderItem } from './entities/order.entity.js';

@Injectable()
export class OrdersService {
  private readonly orders: Map<string, Order> = new Map();
  private orderSequence = 1001;

  createOrder(userId: string, dto: CreateOrderDto): Order {
    const seq = this.orderSequence++;
    const orderId = `order-${seq}`;
    const orderCode = `#${seq}`;

    const items: OrderItem[] = dto.items.map((item, idx) => {
      const lineTotal = item.unitPrice * item.qty;
      return {
        id: `${orderId}-item-${idx + 1}`,
        orderId,
        productId: item.productId,
        productName: item.productName || item.productId,
        size: item.size,
        toppings: item.toppings ?? [],
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal,
      };
    });

    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

    const order: Order = {
      id: orderId,
      orderCode,
      userId,
      status: 'PENDING',
      total,
      items,
      createdAt: new Date().toISOString(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  findByUser(userId: string): Order[] {
    return Array.from(this.orders.values()).filter(
      (order) => order.userId === userId,
    );
  }
}
