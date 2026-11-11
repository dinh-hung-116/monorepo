'use client';

import Link from 'next/link';
import { formatVnd } from '@/lib/pricing';
import { placeholderOrders, type OrderStatus } from '@/lib/orders';

const statusStyles: Record<OrderStatus, string> = {
  'Đã giao': 'bg-emerald-100 text-emerald-800',
  'Đang xử lý': 'bg-amber-100 text-amber-800',
  'Đã hủy': 'bg-red-100 text-red-800',
};

export default function OrdersPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8 rounded-3xl border border-amber-300 p-6 shadow-sm">
        <p className="text-sm font-semibold text-amber-800">BrewLite</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-950">Lịch sử đơn hàng</h1>
        <p className="mt-2 text-zinc-700">Theo dõi các đơn hàng gần đây của bạn.</p>
      </header>

      <div className="space-y-4 rounded-3xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
        {placeholderOrders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="block rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition hover:border-amber-700 hover:shadow-md"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-500">Mã đơn</p>
                <h2 className="mt-1 font-bold text-zinc-900">{order.orderCode}</h2>
                <p className="mt-1 text-sm text-zinc-700">
                  {new Date(order.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-right">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Trạng thái
                </p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>
                  {order.status}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm">
              <span className="text-zinc-700">{order.items.length} món</span>
              <strong className="text-amber-800">{formatVnd(order.total)}</strong>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}