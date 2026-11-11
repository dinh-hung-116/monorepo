export type OrderStatus = 'Đã giao' | 'Đang xử lý' | 'Đã hủy';

export interface OrderItem {
  id: string;
  name: string;
  size: string;
  toppings: string[];
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  orderCode: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
  deliveryAddress: string;
  items: OrderItem[];
}

export const placeholderOrders: Order[] = [
  {
    id: '1001',
    orderCode: 'BL-20261110-1001',
    status: 'Đã giao',
    createdAt: '2026-11-10T08:30:00',
    total: 85000,
    deliveryAddress: '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    items: [
      { id: '1', name: 'Cà phê sữa', size: 'M', toppings: [], quantity: 2, unitPrice: 25000 },
      { id: '2', name: 'Latte', size: 'M', toppings: ['Trân châu'], quantity: 1, unitPrice: 35000 },
    ],
  },
  {
    id: '1002',
    orderCode: 'BL-20261111-1002',
    status: 'Đang xử lý',
    createdAt: '2026-11-11T09:10:00',
    total: 58000,
    deliveryAddress: '45 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
    items: [
      { id: '3', name: 'Trà đào', size: 'L', toppings: [], quantity: 1, unitPrice: 30000 },
      { id: '4', name: 'Bạc xỉu', size: 'M', toppings: ['Kem cheese'], quantity: 1, unitPrice: 28000 },
    ],
  },
  {
    id: '1003',
    orderCode: 'BL-20261108-1003',
    status: 'Đã hủy',
    createdAt: '2026-11-08T14:45:00',
    total: 35000,
    deliveryAddress: '8 Pasteur, Quận 3, TP. Hồ Chí Minh',
    items: [
      { id: '5', name: 'Matcha Latte', size: 'M', toppings: [], quantity: 1, unitPrice: 35000 },
    ],
  },
];

export function getOrderById(id: string) {
  return placeholderOrders.find((order) => order.id === id);
}
