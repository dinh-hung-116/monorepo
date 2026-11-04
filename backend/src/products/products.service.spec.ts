import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from './products.service.js';

// Task 2.2: kiểm tra service với Prisma giả lập, không cần DB thật.
const row = (id: number, overrides = {}) => ({
  id,
  name: `Món ${id}`,
  description: null,
  price: new Prisma.Decimal(25000),
  image_url: 'https://placehold.co/600x400',
  category: 'Cà phê',
  is_available: true,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('ProductsService', () => {
  const prisma = { products: { findMany: vi.fn(), findFirst: vi.fn() } };
  const service = new ProductsService(prisma as unknown as PrismaService);

  beforeEach(() => vi.clearAllMocks());

  it('findAll chỉ lấy món đang bán, đổi sang camelCase và giá kiểu number', async () => {
    prisma.products.findMany.mockResolvedValue([row(1), row(2)]);

    const result = await service.findAll();

    expect(prisma.products.findMany).toHaveBeenCalledWith({
      where: { is_available: true },
      orderBy: { id: 'asc' },
    });
    expect(result).toEqual([
      { id: 1, name: 'Món 1', description: '', price: 25000, imageUrl: 'https://placehold.co/600x400', category: 'Cà phê' },
      { id: 2, name: 'Món 2', description: '', price: 25000, imageUrl: 'https://placehold.co/600x400', category: 'Cà phê' },
    ]);
  });

  it('findAll trả mảng rỗng khi chưa có sản phẩm', async () => {
    prisma.products.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual([]);
  });

  it('findOne trả chi tiết món theo id', async () => {
    prisma.products.findFirst.mockResolvedValue(row(3, { name: 'Latte', price: new Prisma.Decimal('35000.00') }));

    const result = await service.findOne(3);

    expect(prisma.products.findFirst).toHaveBeenCalledWith({ where: { id: 3, is_available: true } });
    expect(result).toMatchObject({ id: 3, name: 'Latte', price: 35000 });
  });

  it('findOne ném 404 khi không có hoặc đã ngừng bán', async () => {
    prisma.products.findFirst.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
