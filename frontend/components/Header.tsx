"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

export default function Header() {
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-amber-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-amber-900"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-700 text-sm font-extrabold text-white">
            BL
          </span>
          <span>BrewLite</span>
        </Link>

        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link
            href="/"
            className="relative inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-amber-950 transition hover:bg-amber-200"
          >
            Menu
          </Link>

          <Link
            href="/cart"
            className="relative inline-flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1.5 text-amber-950 transition hover:bg-amber-200"
          >
            <span>Giỏ hàng</span>
            <span
              data-testid="cart-badge"
              className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-800 px-1.5 py-0.5 text-xs font-bold text-white"
            >
              {totalItems}
            </span>
          </Link>

          <Link
              href="/orders"
              className="relative inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-amber-950 transition hover:bg-amber-200"
          >
            <span>Lịch sử đơn hàng</span>
          </Link>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-zinc-700 sm:inline">
                Xin chào, <strong>{user.name || user.email}</strong>
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-full border border-amber-700 px-3.5 py-1.5 text-amber-800 transition hover:bg-amber-50"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-amber-800 px-3.5 py-1.5 text-white transition hover:bg-amber-900"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
