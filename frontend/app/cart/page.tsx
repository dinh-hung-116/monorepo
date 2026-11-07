'use client';

// Giao diện Giỏ hàng: Thêm/sửa số lượng/xóa và tự tính tổng tiền (Task 5 - Tùng & Long).
import Image from 'next/image';
import Link from 'next/link';
import { formatVnd } from '@/lib/pricing';
import { useCart } from '@/lib/useCart';

export default function CartPage() {
  const { items, isLoaded, totalItems, totalPrice, updateQuantity, removeItem, clearCart } = useCart();

  if (!isLoaded) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12 text-center">
        <p className="text-zinc-500">Đang tải giỏ hàng...</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-10 w-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Giỏ hàng của bạn đang trống</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Hãy chọn những món đồ uống thơm ngon từ menu nhé.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-amber-800 px-6 py-3 font-semibold text-white shadow hover:bg-amber-900 transition"
        >
          Khám phá Menu ngay
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Giỏ hàng ({totalItems} món)</h1>
          <p className="text-sm text-zinc-500">Kiểm tra lại món trước khi tiến hành đặt đơn.</p>
        </div>
        <button
          type="button"
          onClick={clearCart}
          className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
        >
          Xóa toàn bộ
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {/* Danh sách món trong giỏ */}
        <div className="space-y-4 lg:col-span-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Image
                src={item.imageUrl || 'https://placehold.co/600x400?text=BrewLite'}
                alt={item.name}
                width={120}
                height={80}
                unoptimized
                className="h-20 w-24 rounded-xl bg-amber-100 object-cover"
              />
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <h2 className="font-bold text-zinc-900 dark:text-zinc-100">{item.name}</h2>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-zinc-400 hover:text-red-600"
                      aria-label="Xóa món"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Size: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.size}</span>
                    {item.toppings.length > 0 && (
                      <> • Topping: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.toppings.join(', ')}</span></>
                    )}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-500">{formatVnd(item.unitPrice)}</p>
                </div>

                {/* Bộ đếm số lượng */}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="px-2.5 py-0.5 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="px-2.5 py-0.5 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{formatVnd(item.totalPrice)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cột tóm tắt thanh toán */}
        <div className="h-fit rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-bold">Tóm tắt đơn hàng</h2>
          <div className="mt-4 space-y-2 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-800">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Số lượng ly</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{totalItems} ly</span>
            </div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Tạm tính</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatVnd(totalPrice)}</span>
            </div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Phí vận chuyển</span>
              <span className="font-semibold text-emerald-600">Miễn phí</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-base font-bold">
            <span>Tổng thanh toán</span>
            <span className="text-xl text-amber-800 dark:text-amber-500">{formatVnd(totalPrice)}</span>
          </div>

          <button
            type="button"
            onClick={() => alert(`Tính năng gửi API POST /orders sẽ được kích hoạt (Task 6.3 - Long)! Tổng tiền: ${formatVnd(totalPrice)}`)}
            className="mt-6 w-full rounded-xl bg-amber-800 py-3 font-bold text-white shadow transition hover:bg-amber-900 active:scale-[0.99]"
          >
            Tiến hành Đặt hàng
          </button>

          <Link href="/" className="mt-3 block text-center text-sm font-semibold text-zinc-500 hover:text-amber-800">
            ← Tiếp tục chọn thêm món
          </Link>
        </div>
      </div>
    </main>
  );
}

