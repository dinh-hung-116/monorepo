// Task 3.1: kiểm thử service gọi API với fetch giả lập. Chạy: npm test trong thư mục frontend
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  API_URL,
  ApiError,
  createPayment,
  getProduct,
  getProducts,
} from './api.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Thay fetch bằng hàm trả về `response`, ghi lại URL đã gọi. */
function mockFetch(response: Response | Error) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return calls;
}

const latte = { id: 4, name: 'Latte', description: '', price: 35000, imageUrl: '/latte.png', category: 'Cà phê' };

test('getProducts gọi GET /products và trả mảng sản phẩm', async () => {
  const calls = mockFetch(Response.json([latte]));
  assert.deepEqual(await getProducts(), [latte]);
  assert.deepEqual(calls, [`${API_URL}/products`]);
});

test('getProduct gọi GET /products/:id', async () => {
  const calls = mockFetch(Response.json(latte));
  assert.equal((await getProduct(4)).name, 'Latte');
  assert.deepEqual(calls, [`${API_URL}/products/4`]);
});

test('backend trả 404 → ApiError status 404', async () => {
  mockFetch(new Response('', { status: 404 }));
  await assert.rejects(getProduct(999), (err: unknown) => err instanceof ApiError && err.status === 404);
});

test('backend lỗi 500 → ApiError status 500', async () => {
  mockFetch(new Response('', { status: 500 }));
  await assert.rejects(getProducts(), (err: unknown) => err instanceof ApiError && err.status === 500);
});

test('không kết nối được hoặc quá thời gian chờ → ApiError status 0', async () => {
  mockFetch(new TypeError('fetch failed'));
  await assert.rejects(getProducts(), (err: unknown) => err instanceof ApiError && err.status === 0);
});

test('createPayment gửi Idempotency-Key cho mỗi payment attempt', async () => {
  let request: RequestInit | undefined;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    request = init;
    return Response.json({ paymentUrl: 'https://vnpay.example/checkout' });
  }) as typeof fetch;

  await createPayment('#1042', 'checkout-attempt-001');

  assert.equal(request?.method, 'POST');
  assert.equal(
    new Headers(request?.headers).get('Idempotency-Key'),
    'checkout-attempt-001',
  );
});
