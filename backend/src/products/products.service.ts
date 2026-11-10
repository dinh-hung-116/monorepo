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

const img = (text: string) =>
  `https://placehold.co/600x400/6f422b/ffffff?text=${encodeURIComponent(text)}`;

/** Dữ liệu mẫu dự phòng (đồng bộ với prisma/seed.ts) khi CSDL PostgreSQL chưa khởi chạy. */
export const FALLBACK_PRODUCTS: Product[] = [
  { id: 1, name: 'Cà phê đen', description: 'Cà phê đen đậm vị, thơm ngon', price: 20000, imageUrl: img('Ca phe den'), category: 'Cà phê' },
  { id: 2, name: 'Cà phê sữa', description: 'Cà phê kết hợp với sữa đặc', price: 25000, imageUrl: img('Ca phe sua'), category: 'Cà phê' },
  { id: 3, name: 'Bạc xỉu', description: 'Sữa nhiều, cà phê nhẹ', price: 28000, imageUrl: img('Bac xiu'), category: 'Cà phê' },
  { id: 4, name: 'Latte', description: 'Espresso kết hợp với sữa tươi', price: 35000, imageUrl: img('Latte'), category: 'Cà phê' },
  { id: 5, name: 'Trà sữa trân châu', description: 'Trà sữa béo thơm kèm trân châu', price: 30000, imageUrl: img('Tra sua'), category: 'Trà sữa' },
  { id: 6, name: 'Trà đào', description: 'Trà đào thanh mát', price: 30000, imageUrl: img('Tra dao'), category: 'Trà' },
  { id: 7, name: 'Matcha Latte', description: 'Matcha kết hợp với sữa tươi', price: 35000, imageUrl: img('Matcha Latte'), category: 'Matcha' },
  { id: 8, name: 'Chocolate đá', description: 'Chocolate đậm vị, uống cùng đá mát', price: 32000, imageUrl: img('Chocolate'), category: 'Chocolate' },
];

function isDatabaseUnavailableError(err: unknown): boolean {
  if (err instanceof NotFoundException) {
    return false;
  }
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    name.includes('PrismaClientInitializationError') ||
    name.includes('PrismaClientRustPanicError') ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    code === 'P2021' ||
    message.includes("Can't reach database server") ||
    message.includes('Environment variable not found: DATABASE_URL') ||
    message.includes('does not exist in the current database')
  );
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
    try {
      const rows = await this.prisma.products.findMany({
        where: { is_available: true },
        orderBy: { id: 'asc' },
      });
      return rows.map(toProduct);
    } catch (err) {
      if (isDatabaseUnavailableError(err)) {
        return FALLBACK_PRODUCTS;
      }
      throw err;
    }
  }

  /** Chi tiết một món; không có hoặc đã ngừng bán → 404. */
  async findOne(id: number): Promise<Product> {
    try {
      const row = await this.prisma.products.findFirst({
        where: { id, is_available: true },
      });
      if (!row) throw new NotFoundException(`Không tìm thấy sản phẩm ${id}`);
      return toProduct(row);
    } catch (err) {
      if (isDatabaseUnavailableError(err)) {
        const found = FALLBACK_PRODUCTS.find((p) => p.id === id);
        if (!found) throw new NotFoundException(`Không tìm thấy sản phẩm ${id}`);
        return found;
      }
      throw err;
    }
  }
}
