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

/** Lượng tồn của một nguyên liệu (GET /inventory/availability). */
export interface ApiIngredientStock {
  id: number;
  name: string;
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
}

export type ApiSize = 'S' | 'M' | 'L';

/** Số ly còn bán được của một món (null = món chưa có công thức nên không giới hạn). */
export interface ApiProductAvailability {
  productId: number;
  productName: string;
  cups: Record<ApiSize, number | null>;
  limitingIngredient: Record<ApiSize, string | null>;
}

export interface ApiToppingAvailability {
  toppingId: number;
  name: string;
  maxPortions: number | null;
  limitingIngredient: string | null;
}

export interface ApiAvailability {
  ingredients: ApiIngredientStock[];
  products: ApiProductAvailability[];
  toppings: ApiToppingAvailability[];
}

/** Kết quả kiểm tra một lựa chọn cụ thể (size + topping + số lượng). */
export interface ApiItemAvailability {
  available: boolean;
  maxCups: number | null;
  limitingIngredient: string | null;
  shortage: {
    ingredientId: number;
    name: string;
    unit: string;
    quantity: number;
  } | null;
}
