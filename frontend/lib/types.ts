/** Sản phẩm trả về từ GET /products và GET /products/:id (backend Task 2.2). */
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}

export interface Topping {
  id: string;
  name: string;
  price: number;
}

/** Trạng thái đơn hàng lưu trong PostgreSQL. */
export type ApiOrderStatus =
  | "PENDING"
  | "PAID"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "PAYMENT_FAILED"
  | "CANCELLED";

/** Một dòng món trong đơn hàng trả về từ GET /orders/:code. */
export interface ApiOrderItem {
  id: string;
  productName: string;
  size: string;
  toppings: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

/** Đơn hàng trả về từ GET /orders/:code. */
export interface ApiOrder {
  id: string;
  orderCode: string;
  status: ApiOrderStatus;
  total: number;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  note?: string | null;
  items: ApiOrderItem[];
  createdAt: string;
}
