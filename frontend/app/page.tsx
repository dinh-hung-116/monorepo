'use client';

// Task 3.2 + 3.3: trang Menu dạng lưới, có trạng thái loading / empty / lỗi.
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getAvailability, getProducts } from '@/lib/api';
import { formatVnd } from '@/lib/pricing';
import type { Product } from '@/lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      products: Product[];
      /** Số ly còn bán được theo size M; undefined = không có dữ liệu tồn kho. */
      cups: Map<number, number | null>;
    };

export default function MenuPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  // Chỉ gọi setState khi có kết quả (không setState đồng bộ trong effect).
  const fetchMenu = useCallback(() => {
    // Tồn kho là thông tin phụ: lỗi ở đây không được làm hỏng cả menu.
    Promise.all([getProducts(), getAvailability().catch(() => null)])
      .then(([products, availability]) => {
        const cups = new Map<number, number | null>();
        for (const item of availability?.products ?? []) {
          // Card hiển thị giá gốc = giá size S và trang chi tiết mặc định chọn size S,
          // nên số ly trên card phải là của size S (size M/L tốn nhiều nguyên liệu hơn).
          cups.set(item.productId, item.cups.S);
        }
        setState({ kind: 'ready', products, cups });
      })
      .catch(() => setState({ kind: 'error' }));
  }, []);

  useEffect(fetchMenu, [fetchMenu]);

  const retry = () => {
    setState({ kind: 'loading' });
    fetchMenu();
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-amber-800">BrewLite</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Menu đồ uống</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Chọn món, chọn size và topping, rồi thêm vào giỏ.</p>
      </header>

      {state.kind === 'loading' && <MenuSkeleton />}

      {state.kind === 'error' && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-800">
          <p className="font-semibold">Không tải được menu.</p>
          <p className="mt-1 text-sm">Kiểm tra backend đã chạy ở cổng 3001 chưa, rồi thử lại.</p>
          <button onClick={retry} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.products.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center">
          <p className="font-semibold">Menu đang trống</p>
          <p className="mt-1 text-sm text-zinc-600">Chưa có đồ uống nào đang bán. Bạn quay lại sau nhé.</p>
        </div>
      )}

      {state.kind === 'ready' && state.products.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {state.products.map((p, index) => (
            <li key={p.id}>
              <Link
                href={`/products/${p.id}`}
                className="group block overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:border-amber-700 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Image
                  src={p.imageUrl || 'https://placehold.co/600x400?text=BrewLite'}
                  alt={p.name}
                  width={600}
                  height={400}
                  unoptimized
                  priority={index === 0}
                  className="aspect-[3/2] w-full bg-amber-100 object-cover"
                />
                <div className="p-3">
                  <p className="text-xs text-zinc-500">{p.category}</p>
                  <h2 className="font-semibold group-hover:text-amber-800">{p.name}</h2>
                  <p className="mt-1 font-bold text-amber-800">{formatVnd(p.price)}</p>
                  <AvailabilityNote cups={state.cups.get(p.id)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Khung chờ cùng bố cục với lưới thật để trang không bị nhảy khi tải xong. */
function AvailabilityNote({ cups }: { cups: number | null | undefined }) {
  if (cups === undefined || cups === null) return null;
  if (cups <= 0) {
    return (
      <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-400">
        Tạm hết nguyên liệu
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
      Còn khoảng {cups} ly (size S)
    </p>
  );
}

function MenuSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Đang tải menu" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" suppressHydrationWarning>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="animate-pulse overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800" suppressHydrationWarning>
          <div className="aspect-[3/2] bg-zinc-200 dark:bg-zinc-800" suppressHydrationWarning />
          <div className="space-y-2 p-3" suppressHydrationWarning>
            <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" suppressHydrationWarning />
            <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" suppressHydrationWarning />
          </div>
        </li>
      ))}
    </ul>
  );
}
