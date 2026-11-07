export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED';

export type DrinkSize = 'S' | 'M' | 'L';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  size: DrinkSize;
  toppings: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderCode: string;
  userId: string;
  status: OrderStatus;
  total: number;
  items: OrderItem[];
  createdAt: string;
}
