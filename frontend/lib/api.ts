// Gọi API backend – Task 3.1.
import type { Product } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Lỗi API kèm mã HTTP, để giao diện phân biệt 404 với lỗi mạng. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new ApiError(res.status, `Lỗi ${res.status} khi gọi ${path}`);
  return res.json() as Promise<T>;
}

export const getProducts = () => get<Product[]>('/products');
export const getProduct = (id: number) => get<Product>(`/products/${id}`);
