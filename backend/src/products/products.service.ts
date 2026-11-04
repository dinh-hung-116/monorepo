import { Injectable, NotFoundException } from '@nestjs/common';
import type { products as ProductRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/** Dữ liệu một món trả về cho frontend (Task 2 – US-02). */
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}

// Đổi tên cột snake_case trong DB sang camelCase; Decimal → number (VND không có phần lẻ).
const toProduct = (p: ProductRow): Product => ({
  id: p.id,
  name: p.name,
  description: p.description ?? '',
  price: Number(p.price),
  imageUrl: p.image_url ?? '',
  category: p.category ?? '',
});

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Menu: chỉ các món đang bán, theo thứ tự id. */
  async findAll(): Promise<Product[]> {
    const rows = await this.prisma.products.findMany({
      where: { is_available: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(toProduct);
  }

  /** Chi tiết một món; không có hoặc đã ngừng bán → 404. */
  async findOne(id: number): Promise<Product> {
    const row = await this.prisma.products.findFirst({
      where: { id, is_available: true },
    });
    if (!row) throw new NotFoundException(`Không tìm thấy sản phẩm ${id}`);
    return toProduct(row);
  }
}
