// Task 3.1: service gọi API backend.
import type { Product } from "./types";
import type { ApiOrder } from "./types";
import type { Topping } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Quá thời gian này mà backend chưa trả lời thì báo lỗi, không để trang chờ mãi. */
export const TIMEOUT_MS = 8000;

/** Lỗi API kèm mã HTTP; status 0 = không kết nối được hoặc quá thời gian chờ. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(
      0,
      "Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.",
    );
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      res.status === 404
        ? "Không tìm thấy dữ liệu."
        : `Máy chủ báo lỗi ${res.status}.`,
    );
  }
  return (await res.json()) as T;
}

/** GET /products – danh sách món đang bán. */
export const getProducts = () => get<Product[]>("/products");

/** GET /products/:id – chi tiết một món. */
export const getProduct = (id: number) => get<Product>(`/products/${id}`);

/** GET /toppings – danh sách topping đang bán. */
export const getToppings = () => get<Topping[]>("/toppings");

export const validatePromotion = async (code: string, subtotal: number) => {
  const res = await fetch(`${API_URL}/orders/validate-promotion`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, subtotal }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message || "Mã khuyến mãi không hợp lệ.";
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as {
    promotionId: number;
    discountType: "PERCENTAGE" | "FIXED";
    discountValue: number;
    discountAmount: number;
    total: number;
  };
};

/** GET /orders/:code – thông tin một đơn hàng theo mã đơn. */
export const getOrderByCode = async (orderCode: string) => {
  const order = await get<ApiOrder>(`/orders/${encodeURIComponent(orderCode)}`);
  return {
    ...order,
    total:
      typeof order.total === "number" ? order.total : Number(order.total) || 0,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice) || 0,
          qty: Number(item.qty) || 0,
          lineTotal: Number(item.lineTotal) || 0,
        }))
      : [],
  };
};

export const cancelPayment = async (orderCode: string, accessToken: string) => {
  const res = await fetch(
    `${API_URL}/api/payment/cancel/${encodeURIComponent(orderCode)}`,
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn."
        : "Không thể hủy thanh toán.",
    );
  }
  const data = (await res.json()) as { order: ApiOrder };
  return data.order;
};

export const createPayment = async (
  orderCode: string,
  idempotencyKey = crypto.randomUUID(),
) => {
  const res = await fetch(
    `${API_URL}/api/payment/create/${encodeURIComponent(orderCode)}`,
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
  if (!res.ok) {
    throw new ApiError(res.status, "Không thể tạo lại thanh toán.");
  }
  return (await res.json()) as { paymentUrl: string };
};

/** GET /orders/me – lịch sử đơn hàng của tài khoản hiện tại. */
export const getMyOrders = async (accessToken: string) => {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/orders/me`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ApiError(
      0,
      "Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.",
    );
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn."
        : `Máy chủ báo lỗi ${res.status}.`,
    );
  }
  const orders = (await res.json()) as ApiOrder[];
  return orders.map((order) => ({
    ...order,
    total:
      typeof order.total === "number" ? order.total : Number(order.total) || 0,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice) || 0,
          qty: Number(item.qty) || 0,
          lineTotal: Number(item.lineTotal) || 0,
        }))
      : [],
  }));
};
