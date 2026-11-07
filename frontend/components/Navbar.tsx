'use client';

// Navbar hiển thị thương hiệu và badge số lượng giỏ hàng (Task 5.3 - Tùng).
import Link from 'next/link';
import { useCart } from '@/lib/useCart';

export default function Navbar() {
  const { totalItems, isLoaded } = useCart();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-black tracking-tight text-amber-800 dark:text-amber-500">BrewLite</span>
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-600 transition hover:text-amber-800 dark:text-zinc-400 dark:hover:text-amber-500"
          >
            Menu
          </Link>

          <Link
            href="/cart"
            aria-label={`Giỏ hàng có ${totalItems} món`}
            className="relative flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              />
            </svg>
            <span>Giỏ hàng</span>
            {isLoaded && totalItems > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-800 px-1 text-xs font-bold text-white shadow">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

