// Dữ liệu mẫu cho toàn bộ schema.
// Chạy: npx prisma db seed (có thể chạy lại nhiều lần mà không tạo bản ghi trùng)
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const img = (text: string) =>
  `https://placehold.co/600x400/6f422b/ffffff?text=${encodeURIComponent(text)}`;

const PRODUCTS = [
  {
    name: 'Cà phê đen',
    description: 'Cà phê đen đậm vị, thơm ngon',
    price: 20000,
    category: 'Cà phê',
    image: 'Ca phe den',
  },
  {
    name: 'Cà phê sữa',
    description: 'Cà phê kết hợp với sữa đặc',
    price: 25000,
    category: 'Cà phê',
    image: 'Ca phe sua',
  },
  {
    name: 'Bạc xỉu',
    description: 'Sữa nhiều, cà phê nhẹ',
    price: 28000,
    category: 'Cà phê',
    image: 'Bac xiu',
  },
  {
    name: 'Latte',
    description: 'Espresso kết hợp với sữa tươi',
    price: 35000,
    category: 'Cà phê',
    image: 'Latte',
  },
  {
    name: 'Trà sữa trân châu',
    description: 'Trà sữa béo thơm kèm trân châu',
    price: 30000,
    category: 'Trà sữa',
    image: 'Tra sua',
  },
  {
    name: 'Trà đào',
    description: 'Trà đào thanh mát',
    price: 30000,
    category: 'Trà',
    image: 'Tra dao',
  },
  {
    name: 'Matcha Latte',
    description: 'Matcha kết hợp với sữa tươi',
    price: 35000,
    category: 'Matcha',
    image: 'Matcha Latte',
  },
  {
    name: 'Chocolate đá',
    description: 'Chocolate đậm vị, uống cùng đá mát',
    price: 32000,
    category: 'Chocolate',
    image: 'Chocolate',
  },
];

const TOPPINGS = [
  { name: 'Trân châu đen', price: 5000 },
  { name: 'Thạch trái cây', price: 5000 },
  { name: 'Kem cheese', price: 8000 },
];

const INGREDIENTS = [
  { name: 'Cà phê hạt', unit: 'gram', quantity: 10000 },
  { name: 'Sữa tươi', unit: 'ml', quantity: 30000 },
  { name: 'Sữa đặc', unit: 'ml', quantity: 15000 },
  { name: 'Trà đen', unit: 'gram', quantity: 5000 },
  { name: 'Trân châu đen', unit: 'gram', quantity: 8000 },
  { name: 'Đào ngâm', unit: 'gram', quantity: 6000 },
  { name: 'Bột matcha', unit: 'gram', quantity: 3000 },
  { name: 'Bột chocolate', unit: 'gram', quantity: 4000 },
];

const USERS = [
  {
    email: 'customer@brewlite.test',
    name: 'Nguyễn Minh Anh',
    phone: '0901000001',
    role: 'CUSTOMER' as const,
    loyalty_points: 120,
  },
  {
    email: 'staff@brewlite.test',
    name: 'Trần nhân viên',
    phone: '0901000002',
    role: 'STAFF' as const,
    loyalty_points: 0,
  },
  {
    email: 'admin@brewlite.test',
    name: 'Quản trị viên',
    phone: '0901000003',
    role: 'ADMIN' as const,
    loyalty_points: 0,
  },
];

const PROMOTIONS = [
  {
    promo_code: 'WELCOME10',
    name: 'Ưu đãi khách hàng mới',
    description: 'Giảm 10% cho đơn từ 50.000đ',
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    min_order_value: 50000,
    max_discount: 30000,
    usage_limit: 1000,
  },
  {
    promo_code: 'FREESHIP',
    name: 'Khuyến mãi cuối tuần',
    description: 'Giảm trực tiếp 15.000đ cho đơn từ 80.000đ',
    discount_type: 'FIXED_AMOUNT',
    discount_value: 15000,
    min_order_value: 80000,
    max_discount: null,
    usage_limit: 200,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const products = new Map<string, { id: number; price: number }>();
    for (const { image, ...product } of PRODUCTS) {
      const existing = await prisma.products.findFirst({
        where: { name: product.name },
      });
      const row =
        existing ??
        (await prisma.products.create({
          data: { ...product, image_url: img(image) },
        }));
      products.set(row.name, { id: row.id, price: Number(row.price) });
    }

    const toppings = new Map<string, number>();
    for (const topping of TOPPINGS) {
      const row =
        (await prisma.toppings.findFirst({ where: { name: topping.name } })) ??
        (await prisma.toppings.create({ data: topping }));
      toppings.set(row.name, row.id);
    }

    const ingredients = new Map<string, number>();
    for (const ingredient of INGREDIENTS) {
      const row = await prisma.ingredients.upsert({
        where: { name: ingredient.name },
        update: {},
        create: ingredient,
      });
      ingredients.set(row.name, row.id);
    }

    const password_hash = await bcrypt.hash('BrewLite123!', 10);
    const users = new Map<string, number>();
    for (const user of USERS) {
      const row = await prisma.users.upsert({
        where: { email: user.email },
        update: { name: user.name, phone: user.phone, role: user.role },
        create: { ...user, password_hash },
      });
      users.set(row.email, row.id);
    }

    const now = new Date('2026-11-11T12:00:00.000Z');
    const promotions = new Map<string, number>();
    for (const promotion of PROMOTIONS) {
      const row = await prisma.promotions.upsert({
        where: { promo_code: promotion.promo_code },
        update: { is_active: true },
        create: {
          ...promotion,
          start_date: new Date('2026-01-01T00:00:00.000Z'),
          end_date: new Date('2027-01-01T00:00:00.000Z'),
        },
      });
      promotions.set(row.promo_code!, row.id);
    }

    const recipeData: Record<string, Array<[string, number]>> = {
      'Cà phê đen': [['Cà phê hạt', 18]],
      'Cà phê sữa': [
        ['Cà phê hạt', 18],
        ['Sữa đặc', 20],
      ],
      'Bạc xỉu': [
        ['Cà phê hạt', 12],
        ['Sữa tươi', 120],
        ['Sữa đặc', 15],
      ],
      Latte: [
        ['Cà phê hạt', 18],
        ['Sữa tươi', 150],
      ],
      'Trà sữa trân châu': [
        ['Trà đen', 8],
        ['Sữa tươi', 120],
        ['Trân châu đen', 50],
      ],
      'Trà đào': [
        ['Trà đen', 8],
        ['Đào ngâm', 80],
      ],
      'Matcha Latte': [
        ['Bột matcha', 5],
        ['Sữa tươi', 150],
      ],
      'Chocolate đá': [
        ['Bột chocolate', 25],
        ['Sữa tươi', 120],
      ],
    };
    for (const [productName, recipeIngredients] of Object.entries(recipeData)) {
      const product = products.get(productName)!;
      const recipe = await prisma.recipes.upsert({
        where: { product_id: product.id },
        update: {},
        create: { product_id: product.id },
      });
      for (const [name, quantity] of recipeIngredients) {
        await prisma.recipe_ingredients.upsert({
          where: {
            recipe_id_ingredient_id: {
              recipe_id: recipe.id,
              ingredient_id: ingredients.get(name)!,
            },
          },
          update: { quantity },
          create: {
            recipe_id: recipe.id,
            ingredient_id: ingredients.get(name)!,
            quantity,
          },
        });
      }
    }

    const customerId = users.get('customer@brewlite.test')!;
    const coffee = products.get('Cà phê sữa')!;
    const tea = products.get('Trà sữa trân châu')!;
    const firstOrder = await prisma.orders.upsert({
      where: { order_code: '#1001' },
      update: {},
      create: {
        order_code: '#1001',
        user_id: customerId,
        status: 'COMPLETED',
        total_price: 55000,
        discount_amount: 0,
        created_at: new Date('2026-11-09T08:30:00.000Z'),
        items: {
          create: [
            {
              product_id: coffee.id,
              product_name: 'Cà phê sữa',
              size: 'M',
              price: coffee.price,
              quantity: 1,
              subtotal: coffee.price,
            },
            {
              product_id: tea.id,
              product_name: 'Trà sữa trân châu',
              size: 'M',
              price: tea.price,
              quantity: 1,
              subtotal: tea.price,
              item_toppings: {
                create: [
                  {
                    topping_id: toppings.get('Trân châu đen')!,
                    topping_name: 'Trân châu đen',
                    price: 5000,
                  },
                ],
              },
            },
          ],
        },
      },
    });
    const secondOrder = await prisma.orders.upsert({
      where: { order_code: '#1002' },
      update: {},
      create: {
        order_code: '#1002',
        user_id: customerId,
        promotion_id: promotions.get('WELCOME10'),
        status: 'PAID',
        total_price: 63000,
        discount_amount: 7000,
        created_at: new Date('2026-11-11T09:00:00.000Z'),
        items: {
          create: [
            {
              product_id: products.get('Latte')!.id,
              product_name: 'Latte',
              size: 'L',
              price: 35000,
              quantity: 2,
              subtotal: 70000,
            },
          ],
        },
      },
    });

    await prisma.payments.upsert({
      where: { idempotencyKey: 'seed-payment-1001' },
      update: {},
      create: {
        order_id: firstOrder.id,
        idempotencyKey: 'seed-payment-1001',
        payment_method: 'VNPAY',
        amount: 55000,
        status: 'SUCCESS',
        bank_code: 'NCB',
      },
    });
    await prisma.payments.upsert({
      where: { idempotencyKey: 'seed-payment-1002' },
      update: {},
      create: {
        order_id: secondOrder.id,
        idempotencyKey: 'seed-payment-1002',
        payment_method: 'VNPAY',
        amount: 63000,
        status: 'SUCCESS',
        bank_code: 'VCB',
      },
    });
    for (const [order_id, points] of [
      [firstOrder.id, 55],
      [secondOrder.id, 63],
    ] as const) {
      const existing = await prisma.loyaltytransactions.findFirst({
        where: { order_id },
      });
      if (!existing) {
        await prisma.loyaltytransactions.create({
          data: { user_id: customerId, order_id, points, created_at: now },
        });
      }
    }

    console.log(
      'Đã seed sản phẩm, người dùng, topping, nguyên liệu, công thức, khuyến mãi, đơn hàng, thanh toán và điểm tích lũy.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
