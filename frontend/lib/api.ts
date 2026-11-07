// Task 3.1: service gọi API backend.
import type { Product } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Quá thời gian này mà backend chưa trả lời thì báo lỗi, không để trang chờ mãi. */
export const TIMEOUT_MS = 8000;

/** Lỗi API kèm mã HTTP; status 0 = không kết nối được hoặc quá thời gian chờ. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.');
  }
  if (!res.ok) {
    throw new ApiError(res.status, res.status === 404 ? 'Không tìm thấy dữ liệu.' : `Máy chủ báo lỗi ${res.status}.`);
  }
  return (await res.json()) as T;
}

/** GET /products – danh sách món đang bán. */
export const getProducts = () => get<Product[]>('/products');

/** GET /products/:id – chi tiết một món. */
export const getProduct = (id: number) => get<Product>(`/products/${id}`);
