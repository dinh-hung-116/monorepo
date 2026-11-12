'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiError, getOrderByCode } from '@/lib/api';
import { formatVnd } from '@/lib/pricing';
import type { ApiOrder, ApiOrderStatus } from '@/lib/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

const statusLabels: Record<ApiOrderStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PREPARING: 'Đang pha chế',
  READY: 'Sẵn sàng nhận hàng',
  COMPLETED: 'Hoàn tất',
  PAYMENT_FAILED: 'Thanh toán thất bại',
  CANCELLED: 'Đã hủy',
};

const statusStyles: Record<ApiOrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PREPARING: 'bg-sky-100 text-sky-800',
  READY: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  PAYMENT_FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<ConfirmationSkeleton />}>
      <OrderConfirmation />
    </Suspense>
  );
}

function OrderConfirmation() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get('orderCode');
  const hasError = searchParams.get('error') !== null;

  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(orderCode));

  // Xóa giỏ hàng khi thanh toán thành công; ref để chỉ chạy 1 lần mỗi đơn.
  const { clearCart } = useCart();
  const { accessToken } = useAuth();
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!orderCode || !accessToken) return;

    let cancelled = false;
    setLoading(true);
    getOrderByCode(orderCode, accessToken)
      .then((data) => {
        if (!cancelled) {
          setOrder(data);
          // Chỉ xóa giỏ hàng khi thanh toán thực sự thành công (PAID).
          // Nếu trạng thái là PAYMENT_FAILED thì giỏ hàng được giữ nguyên
          // để người dùng có thể thử lại.
          if (data.status === 'PAID' && !clearedRef.current) {
            clearedRef.current = true;
            clearCart();
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Không tải được thông tin đơn hàng.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode, accessToken]);

  if (!orderCode) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-zinc-900">
            {hasError ? 'Thanh toán chưa hoàn tất' : 'Chưa có thông tin đơn hàng'}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {hasError
              ? 'Giao dịch VNPay không thành công hoặc chữ ký không hợp lệ. Giỏ hàng của bạn vẫn được giữ nguyên để thử lại.'
              : 'Đường dẫn không có mã đơn hàng. Hãy mở lại từ trang thanh toán hoặc xem lịch sử đơn hàng.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
            <Link
              href="/cart"
              className="rounded-xl bg-amber-900 px-4 py-2 text-white hover:bg-amber-950"
            >
              Quay lại giỏ hàng
            </Link>
            <Link
              href="/orders"
              className="rounded-xl border border-amber-300 px-4 py-2 text-amber-900 hover:bg-amber-50"
            >
              Xem đơn hàng của tôi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return <ConfirmationSkeleton />;
  }

  if (error || !order) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-zinc-900">
            Không tìm thấy đơn hàng
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {error ?? `Đơn hàng ${orderCode} không tồn tại.`}
          </p>
          <Link
            href="/orders"
            className="mt-6 inline-block text-sm font-semibold text-amber-800 hover:text-amber-950"
          >
            ← Quay lại lịch sử đơn hàng
          </Link>
        </div>
      </main>
    );
  }

  const paid = order.status === 'PAID';
  const paymentFailed = order.status === 'PAYMENT_FAILED';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${
              paid
                ? 'bg-emerald-100 text-emerald-700'
                : paymentFailed
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-800'
            }`}
            aria-hidden
          >
            {paid ? '✓' : paymentFailed ? '✕' : '⏳'}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              {paid
                ? 'Thanh toán thành công'
                : paymentFailed
                  ? 'Thanh toán không thành công'
                  : 'Đơn hàng đã được ghi nhận'}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {paid
                ? 'BrewLite đã nhận được thanh toán và bắt đầu chuẩn bị đơn của bạn.'
                : paymentFailed
                  ? 'Giao dịch VNPay không thành công nên đơn được đánh dấu thanh toán thất bại. Giỏ hàng của bạn vẫn được giữ nguyên.'
                  : 'Đơn hàng chưa được thanh toán. Vui lòng kiểm tra lại giao dịch VNPay.'}
            </p>
          </div>
        </div>

        {paymentFailed && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Vui lòng kiểm tra chi tiết đơn hàng để xem trạng thái và thử lại
            thanh toán. Giỏ hàng vẫn còn đủ món bạn đã chọn.
            <Link
              href={`/orders/${encodeURIComponent(order.orderCode)}`}
              className="ml-1 font-semibold underline hover:text-amber-950"
            >
              Xem chi tiết đơn hàng
            </Link>
          </div>
        )}

        <dl className="mt-6 divide-y divide-zinc-100 border-y border-zinc-100 text-sm">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-zinc-500">Mã đơn hàng</dt>
            <dd className="font-mono text-base font-semibold text-zinc-900">
              {order.orderCode}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-zinc-500">Trạng thái</dt>
            <dd>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  statusStyles[order.status] ?? 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {statusLabels[order.status] ?? order.status}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-zinc-500">Thời gian đặt</dt>
            <dd className="text-zinc-800">
              {new Date(order.createdAt).toLocaleString('vi-VN')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-zinc-500">Tổng thanh toán</dt>
            <dd className="text-lg font-bold text-amber-800">
              {formatVnd(order.total)}
            </dd>
          </div>
        </dl>

        {order.items.length > 0 && (
          <section className="pt-5">
            <h2 className="font-semibold text-zinc-900">Món đã đặt</h2>
            <div className="mt-3 divide-y divide-zinc-100">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {item.productName} × {item.qty}
                    </p>
                    <p className="mt-1 text-zinc-500">
                      Size {item.size}
                      {item.toppings.length > 0
                        ? ` · ${item.toppings.join(', ')}`
                        : ''}
                    </p>
                  </div>
                  <span className="font-semibold">
                    {formatVnd(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {order.address && (
          <section className="border-t border-zinc-100 pt-5 mt-5">
            <h2 className="font-semibold text-zinc-900">Địa chỉ nhận hàng</h2>
            <p className="mt-1 text-sm text-zinc-600">{order.address}</p>
          </section>
        )}

        <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
          {paymentFailed && (
            <Link
              href="/cart"
              className="rounded-xl bg-amber-900 px-4 py-2 text-white hover:bg-amber-950"
            >
              Quay lại giỏ hàng
            </Link>
          )}
          <Link
            href="/orders"
            className={`rounded-xl px-4 py-2 ${
              paymentFailed
                ? 'border border-amber-300 text-amber-900 hover:bg-amber-50'
                : 'bg-amber-900 text-white hover:bg-amber-950'
            }`}
          >
            Xem đơn hàng của tôi
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-amber-300 px-4 py-2 text-amber-900 hover:bg-amber-50"
          >
            Tiếp tục mua hàng
          </Link>
        </div>
      </div>
    </main>
  );
}

function ConfirmationSkeleton() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="h-80 animate-pulse rounded-2xl bg-zinc-200" />
    </main>
  );
}
