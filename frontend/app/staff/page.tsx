"use client";

// Màn hình quầy pha chế (barista): đơn đã thanh toán → đang pha → sẵn sàng → giao khách.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getStaffQueue, updateOrderStatus } from "@/lib/api";
import { formatOrderDate, formatVnd } from "@/lib/pricing";
import type { ApiOrder } from "@/lib/types";

const REFRESH_MS = 5000;
const STAFF_ROLES = ["STAFF", "ADMIN"];

type NextStatus = "PREPARING" | "READY" | "COMPLETED";

const COLUMNS: {
  status: ApiOrder["status"];
  title: string;
  next: NextStatus;
  action: string;
  tone: string;
}[] = [
  { status: "PAID", title: "Chờ nhận", next: "PREPARING", action: "Nhận đơn", tone: "border-blue-200 bg-blue-50" },
  { status: "PREPARING", title: "Đang pha", next: "READY", action: "Pha xong", tone: "border-violet-200 bg-violet-50" },
  { status: "READY", title: "Sẵn sàng", next: "COMPLETED", action: "Đã giao khách", tone: "border-sky-200 bg-sky-50" },
];

export default function StaffPage() {
  const { user, accessToken, isAuthenticated } = useAuth();
  const isStaff = Boolean(user?.role && STAFF_ROLES.includes(user.role));
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  // Đổi refreshKey để tải lại ngay (sau khi bấm nút), ngoài vòng tự tải mỗi 5 giây.
  const [refreshKey, setRefreshKey] = useState(0);
  const load = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    if (!isStaff || !accessToken) return;
    const fetchQueue = () =>
      getStaffQueue(accessToken)
        .then((queue) => {
          setOrders(queue);
          setError(null);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Không tải được đơn."),
        );
    fetchQueue();
    const timer = window.setInterval(fetchQueue, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isStaff, accessToken, refreshKey]);

  const move = async (order: ApiOrder, status: NextStatus | "CANCELLED") => {
    if (!accessToken || busyCode) return;
    if (
      status === "CANCELLED" &&
      !window.confirm(`Huỷ đơn ${order.orderCode}? Khách sẽ thấy đơn bị huỷ.`)
    ) {
      return;
    }
    setBusyCode(order.orderCode);
    try {
      await updateOrderStatus(order.orderCode, status, accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được đơn.");
    } finally {
      setBusyCode(null);
      load();
    }
  };

  if (!isAuthenticated) {
    return (
      <Notice text="Đăng nhập bằng tài khoản nhân viên để vào quầy pha chế.">
        <Link href="/login" className="font-semibold text-amber-800">
          Đăng nhập →
        </Link>
      </Notice>
    );
  }
  if (!isStaff) {
    return <Notice text="Trang này chỉ dành cho nhân viên quầy." />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Quầy pha chế</h1>
          <p className="text-sm text-zinc-500">
            Tự cập nhật mỗi {REFRESH_MS / 1000} giây.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100"
        >
          Tải lại
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {orders === null ? (
        <p className="mt-8 text-zinc-500">Đang tải đơn...</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = orders.filter((o) => o.status === col.status);
            return (
              <section key={col.status} className={`rounded-2xl border p-3 ${col.tone}`}>
                <h2 className="mb-3 font-semibold">
                  {col.title} <span className="text-zinc-500">({list.length})</span>
                </h2>
                {list.length === 0 && (
                  <p className="text-sm text-zinc-500">Không có đơn.</p>
                )}
                <ul className="space-y-3">
                  {list.map((order) => (
                    <li key={order.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                      <div className="flex items-baseline justify-between">
                        <strong>{order.orderCode}</strong>
                        <span className="text-xs text-zinc-500">
                          {formatOrderDate(order.createdAt)}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            {item.qty} × {item.productName} ({item.size})
                            {item.toppings.length > 0 && (
                              <span className="text-zinc-500"> + {item.toppings.join(", ")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm text-zinc-500">{formatVnd(order.total)}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busyCode !== null}
                          onClick={() => move(order, col.next)}
                          className="flex-1 rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
                        >
                          {busyCode === order.orderCode ? "Đang lưu..." : col.action}
                        </button>
                        {order.status === "PAID" && (
                          <button
                            type="button"
                            disabled={busyCode !== null}
                            onClick={() => move(order, "CANCELLED")}
                            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Huỷ
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Notice({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Quầy pha chế</h1>
      <p className="mt-2 text-zinc-600">{text}</p>
      <div className="mt-4">{children}</div>
    </main>
  );
}
