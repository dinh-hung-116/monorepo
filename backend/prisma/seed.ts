// Task 2.1: dữ liệu mẫu cho menu, 8 đồ uống.
// Chạy: npx prisma db seed   (đã có sản phẩm thì bỏ qua, chạy lại nhiều lần vẫn an toàn)
import { PrismaClient } from '@prisma/client';

const img = (text: string) => `https://placehold.co/600x400/6f422b/ffffff?text=${encodeURIComponent(text)}`;

const PRODUCTS = [
  { name: 'Cà phê đen', description: 'Cà phê đen đậm vị, thơm ngon', price: 20000, category: 'Cà phê', image: 'Ca phe den' },
  { name: 'Cà phê sữa', description: 'Cà phê kết hợp với sữa đặc', price: 25000, category: 'Cà phê', image: 'Ca phe sua' },
  { name: 'Bạc xỉu', description: 'Sữa nhiều, cà phê nhẹ', price: 28000, category: 'Cà phê', image: 'Bac xiu' },
  { name: 'Latte', description: 'Espresso kết hợp với sữa tươi', price: 35000, category: 'Cà phê', image: 'Latte' },
  { name: 'Trà sữa trân châu', description: 'Trà sữa béo thơm kèm trân châu', price: 30000, category: 'Trà sữa', image: 'Tra sua' },
  { name: 'Trà đào', description: 'Trà đào thanh mát', price: 30000, category: 'Trà', image: 'Tra dao' },
  { name: 'Matcha Latte', description: 'Matcha kết hợp với sữa tươi', price: 35000, category: 'Matcha', image: 'Matcha Latte' },
  { name: 'Chocolate đá', description: 'Chocolate đậm vị, uống cùng đá mát', price: 32000, category: 'Chocolate', image: 'Chocolate' },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    if ((await prisma.products.count()) > 0) {
      console.log('Đã có sản phẩm, bỏ qua seed.');
      return;
    }
    await prisma.products.createMany({
      data: PRODUCTS.map(({ image, ...p }) => ({ ...p, image_url: img(image) })),
    });
    console.log(`Đã thêm ${PRODUCTS.length} sản phẩm mẫu.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
