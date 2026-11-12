"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { formatOrderDate, formatVnd } from "@/lib/pricing";
import { cancelPayment, createPayment, getOrderByCode } from "@/lib/api";
import type { ApiOrder } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

const statusStyles: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-blue-200 bg-blue-50 text-blue-800",
  PAYMENT_FAILED: "border-orange-200 bg-orange-50 text-orange-800",
  PREPARING: "border-violet-200 bg-violet-50 text-violet-800",
  READY: "border-sky-200 bg-sky-50 text-sky-800",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};
const statusLabels: Record<string, string> = {
  PENDING: "Đang xử lý",
  PAID: "Đã thanh toán",
  PAYMENT_FAILED: "Thanh toán thất bại",
  CANCELLED: "Đã hủy",
  PREPARING: "Đang pha chế",
  READY: "Đã sẵn sàng",
  COMPLETED: "Đã hoàn thành",
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
  const { accessToken } = useAuth();
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    getOrderByCode(decodeURIComponent(id), accessToken)
      .then((loadedOrder) => {
        setOrder(loadedOrder);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id, accessToken]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const canCancel =
    order && ["PENDING", "PAID", "PAYMENT_FAILED"].includes(order.status);
  const canRetry = order?.status === "PAYMENT_FAILED";

  const handleCancel = async () => {
    if (!order || !accessToken || cancelling) return;
    if (
      !window.confirm("Bạn có chắc muốn hủy thanh toán/đơn hàng này không?")
    ) {
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      const cancelledOrder = await cancelPayment(order.orderCode, accessToken);
      setOrder((currentOrder) =>
        currentOrder
          ? {
              ...currentOrder,
              status: cancelledOrder.status ?? "CANCELLED",
            }
          : currentOrder,
      );
      setToast({
        kind: "success",
        message: "Đơn hàng đã được hủy thành công.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể hủy đơn hàng.";
      setCancelError(message);
      setToast({ kind: "error", message });
    } finally {
      setCancelling(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!order || !accessToken || retrying) return;
    setRetrying(true);
    setCancelError(null);
    try {
      const { paymentUrl } = await createPayment(order.orderCode, accessToken);
      window.location.href = paymentUrl;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể thử lại thanh toán.";
      setToast({ kind: "error", message });
    } finally {
      setRetrying(false);
    }
  };

  if (state === "loading") return <OrderDetailSkeleton />;

  if (state === "error" || !order) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Không tìm thấy đơn hàng</h1>
        <p className="mt-2 text-zinc-600">
          Đơn hàng này không tồn tại hoặc không thể tải từ máy chủ.
        </p>
        <Link
          href="/orders"
          className="mt-5 inline-block font-semibold text-amber-800"
        >
          ← Quay lại lịch sử đơn hàng
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`fixed right-4 top-4 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}
      <Link
        href="/orders"
        className="text-sm font-semibold text-amber-800 hover:text-amber-950"
      >
        ← Quay lại lịch sử đơn hàng
      </Link>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 pb-5">
          <div>
            <p className="text-sm text-zinc-500">Chi tiết đơn hàng</p>
            <h1 className="mt-1 text-2xl font-bold">{order.orderCode}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {formatOrderDate(order.createdAt)}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[order.status] ?? "border-zinc-200 bg-zinc-100 text-zinc-800"}`}
          >
            {statusLabels[order.status] ?? order.status}
          </span>
        </div>

        <section className="border-b border-zinc-100 py-5">
          <h2 className="font-semibold">Món đã đặt</h2>
          <div className="mt-3 divide-y divide-zinc-100">
            {(order.items ?? []).map((item) => (
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
                      ? ` · ${item.toppings.join(", ")}`
                      : ""}
                  </p>
                </div>
                <span className="font-semibold">
                  {formatVnd(item.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-zinc-100 py-5">
          <h2 className="font-semibold">Địa chỉ nhận hàng</h2>
          <p className="mt-2 text-sm text-zinc-600">
            {order.address ?? "Nhận tại cửa hàng"}
          </p>
        </section>

        <div className="flex items-center justify-between pt-5">
          <span className="text-zinc-600">Tổng cộng</span>
          <strong className="text-xl text-amber-800">
            {formatVnd(order.total)}
          </strong>
        </div>
        {(canCancel || canRetry) && (
          <div className="mt-5 border-t border-zinc-100 pt-5">
            {canRetry && (
              <button
                type="button"
                onClick={handleRetryPayment}
                disabled={retrying}
                className="mr-3 rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retrying ? "Đang chuyển..." : "Thanh toán lại"}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling || !accessToken}
                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? "Đang hủy..." : "Hủy đơn hàng"}
              </button>
            )}
            {cancelError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {cancelError}
              </p>
            )}
          </div>
        )}
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
