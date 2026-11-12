"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatOrderDate, formatVnd } from "@/lib/pricing";
import { getMyOrders } from "@/lib/api";
import type { ApiOrder } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

const statusStyles: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-blue-200 bg-blue-50 text-blue-800",
  PAYMENT_FAILED: "border-orange-200 bg-orange-50 text-orange-800",
  PREPARING: "border-violet-200 bg-violet-50 text-violet-800",
  READY: "border-sky-200 bg-sky-50 text-sky-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
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

export default function OrdersPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setState("ready");
      return;
    }
    getMyOrders(accessToken)
      .then((loadedOrders) => {
        setOrders(loadedOrders);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [accessToken, isAuthenticated]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8 rounded-3xl border border-amber-300 p-6 shadow-sm">
        <p className="text-sm font-semibold text-amber-800">BrewLite</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-950">
          Lịch sử đơn hàng
        </h1>
        <p className="mt-2 text-zinc-700">
          Theo dõi các đơn hàng gần đây của bạn.
        </p>
      </header>

      {!isAuthenticated && (
        <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6 text-center">
          Vui lòng{" "}
          <Link href="/login" className="font-semibold text-amber-800">
            đăng nhập
          </Link>{" "}
          để xem lịch sử đơn hàng.
        </div>
      )}
      {state === "loading" && (
        <p className="rounded-3xl border border-amber-300 p-6">
          Đang tải đơn hàng...
        </p>
      )}
      {state === "error" && (
        <p
          role="alert"
          className="rounded-3xl border border-red-300 bg-red-50 p-6 text-red-800"
        >
          Không tải được lịch sử đơn hàng.
        </p>
      )}
      {state === "ready" && isAuthenticated && orders.length === 0 && (
        <p className="rounded-3xl border border-amber-300 p-6 text-center">
          Bạn chưa có đơn hàng nào.
        </p>
      )}
      {state === "ready" && orders.length > 0 && (
        <div className="space-y-4 rounded-3xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
          {orders.map((order) => (
            <Link
              key={order.orderCode}
              href={`/orders/${encodeURIComponent(order.orderCode)}`}
              className="block rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition hover:border-amber-700 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Mã đơn</p>
                  <h2 className="mt-1 font-bold text-zinc-900">
                    {order.orderCode}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-700">
                    {formatOrderDate(order.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    Trạng thái
                  </p>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[order.status] ?? "border-zinc-200 bg-zinc-100 text-zinc-800"}`}
                  >
                    {statusLabels[order.status] ?? order.status}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm">
                <span className="text-zinc-700">
                  {(order.items ?? []).length} món
                </span>
                <strong className="text-amber-800">
                  {formatVnd(order.total)}
                </strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
