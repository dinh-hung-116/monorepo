'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { formatVnd } from '@/lib/pricing';
import { getOrderById, type OrderStatus } from '@/lib/orders';

const statusStyles: Record<OrderStatus, string> = {
  'Đã giao': 'bg-emerald-100 text-emerald-800',
  'Đang xử lý': 'bg-amber-100 text-amber-800',
  'Đã hủy': 'bg-red-100 text-red-800',
};

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetail />
    </Suspense>
  );
}

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const order = getOrderById(id);

  if (!order) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Không tìm thấy đơn hàng</h1>
        <p className="mt-2 text-zinc-600">Đơn hàng này không tồn tại trong dữ liệu mẫu.</p>
        <Link href="/orders" className="mt-5 inline-block font-semibold text-amber-800">
          ← Quay lại lịch sử đơn hàng
        </Link>
      </main>
    );
  }

  const itemTotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/orders" className="text-sm font-semibold text-amber-800 hover:text-amber-950">
        ← Quay lại lịch sử đơn hàng
      </Link>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 pb-5">
          <div>
            <p className="text-sm text-zinc-500">Chi tiết đơn hàng</p>
            <h1 className="mt-1 text-2xl font-bold">{order.orderCode}</h1>
            <p className="mt-2 text-sm text-zinc-500">{new Date(order.createdAt).toLocaleString('vi-VN')}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>
            {order.status}
          </span>
        </div>

        <section className="border-b border-zinc-100 py-5">
          <h2 className="font-semibold">Món đã đặt</h2>
          <div className="mt-3 divide-y divide-zinc-100">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.name} × {item.quantity}</p>
                  <p className="mt-1 text-zinc-500">
                    Size {item.size}{item.toppings.length > 0 ? ` · ${item.toppings.join(', ')}` : ''}
                  </p>
                </div>
                <span className="font-semibold">{formatVnd(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-zinc-100 py-5">
          <h2 className="font-semibold">Địa chỉ nhận hàng</h2>
          <p className="mt-2 text-sm text-zinc-600">{order.deliveryAddress}</p>
        </section>

        <div className="flex items-center justify-between pt-5">
          <span className="text-zinc-600">Tổng cộng</span>
          <strong className="text-xl text-amber-800">{formatVnd(itemTotal)}</strong>
        </div>
      </div>
    </main>
  );
}

function OrderDetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="h-5 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="mt-6 h-96 animate-pulse rounded-2xl bg-zinc-200" />
    </main>
  );
}