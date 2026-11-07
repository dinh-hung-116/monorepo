// Task 6.2: Nghiệp vụ tạo đơn hàng, tính giá server-side và lưu đơn PENDING (Tùng).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

const SIZE_EXTRAS: Record<string, number> = {
  S: 0,
  M: 5000,
  L: 10000,
};

const TOPPING_PRICES: Record<string, { name: string; price: number }> = {
  'tran-chau': { name: 'Trân châu', price: 7000 },
  pudding: { name: 'Pudding', price: 8000 },
  'kem-cheese': { name: 'Kem cheese', price: 10000 },
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo đơn hàng mới từ giỏ hàng, tính giá chuẩn từ DB và lưu trạng thái PENDING. */
  async create(dto: CreateOrderDto, userId?: number) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Giỏ hàng trống, không thể tạo đơn.');
    }

    // Lấy danh sách ID sản phẩm duy nhất trong giỏ
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.products.findMany({
      where: { id: { in: productIds }, is_available: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let orderTotal = 0;
    const orderItemsData: {
      productId: number;
      productName: string;
      size: string;
      toppings: any;
      price: number;
      quantity: number;
      subtotal: number;
    }[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Sản phẩm #${item.productId} không tồn tại hoặc đã ngừng bán.`);
      }

      const basePrice = Number(product.price);
      const sizeExtra = SIZE_EXTRAS[item.size] ?? 0;

      // Xử lý toppings hợp lệ
      const validToppings: { id: string; name: string; price: number }[] = [];
      let toppingTotal = 0;
      if (Array.isArray(item.toppings)) {
        const uniqueToppings = [...new Set(item.toppings)];
        for (const topId of uniqueToppings) {
          if (TOPPING_PRICES[topId]) {
            validToppings.push({
              id: topId,
              name: TOPPING_PRICES[topId].name,
              price: TOPPING_PRICES[topId].price,
            });
            toppingTotal += TOPPING_PRICES[topId].price;
          }
        }
      }

      const unitPrice = basePrice + sizeExtra + toppingTotal;
      const quantity = Math.max(1, Math.floor(item.quantity));
      const lineTotal = unitPrice * quantity;

      orderTotal += lineTotal;
      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        size: item.size,
        toppings: validToppings,
        price: unitPrice,
        quantity,
        subtotal: lineTotal,
      });
    }

    // Sinh mã đơn hàng dạng: BL-YYMMDD-XXXX (vd: BL-261107-1234)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const orderCode = `BL-${dateStr}-${randomSuffix}`;

    // Tạo đơn và các món trong 1 transaction an toàn
    const createdOrder = await this.prisma.orders.create({
      data: {
        order_code: orderCode,
        user_id: userId ?? null,
        status: 'PENDING', // Mặc định đơn mới luôn là PENDING (Task 6.2)
        total_price: orderTotal,
        customer_name: dto.customerName ?? null,
        customer_phone: dto.customerPhone ?? null,
        address: dto.address ?? null,
        note: dto.note ?? null,
        items: {
          create: orderItemsData.map((d) => ({
            product_id: d.productId,
            product_name: d.productName,
            size: d.size,
            toppings: d.toppings,
            price: d.price,
            quantity: d.quantity,
            subtotal: d.subtotal,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return {
      id: createdOrder.id,
      orderCode: createdOrder.order_code,
      status: createdOrder.status,
      totalPrice: Number(createdOrder.total_price),
      createdAt: createdOrder.created_at,
      itemCount: createdOrder.items.length,
    };
  }

  /** Lấy chi tiết đơn hàng theo orderCode hoặc id. */
  async findOne(orderCode: string) {
    const order = await this.prisma.orders.findUnique({
      where: { order_code: orderCode },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderCode}`);
    }
    return {
      id: order.id,
      orderCode: order.order_code,
      status: order.status,
      totalPrice: Number(order.total_price),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      address: order.address,
      note: order.note,
      createdAt: order.created_at,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        size: i.size,
        toppings: i.toppings,
        price: Number(i.price),
        quantity: i.quantity,
        subtotal: Number(i.subtotal),
      })),
    };
  }
}

