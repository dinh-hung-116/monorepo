'use client';

// Task 4.1 + 4.3: trang chi tiết sản phẩm và tính giá theo tùy chọn.
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ApiError, getProduct } from '@/lib/api';
import ProductOptions from '@/components/ProductOptions';
import { calculatePrice, formatVnd, type Size, type ToppingId } from '@/lib/pricing';
import type { Product } from '@/lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error' }
  | { kind: 'ready'; product: Product };

export default function ProductDetailPage() {
  // useParams cần nằm trong Suspense khi bật cacheComponents (next.config.ts)
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ProductDetail />
    </Suspense>
  );
}

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const validId = Number.isInteger(productId) && productId > 0;
  const [state, setState] = useState<State>(validId ? { kind: 'loading' } : { kind: 'not-found' });
  const [size, setSize] = useState<Size>('S');
  const [toppings, setToppings] = useState<ToppingId[]>([]);

  useEffect(() => {
    if (!validId) return;
    getProduct(productId)
      .then((product) => setState({ kind: 'ready', product }))
      .catch((err) => setState({ kind: err instanceof ApiError && err.status === 404 ? 'not-found' : 'error' }));
  }, [productId, validId]);

  const back = (
    <Link href="/" className="text-sm font-medium text-amber-800 hover:underline">
      ← Quay lại menu
    </Link>
  );

  if (state.kind === 'loading') return <DetailSkeleton />;

  if (state.kind !== 'ready') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        {back}
        <div role="alert" className="mt-6 rounded-xl border border-zinc-300 p-8 text-center">
          <p className="font-semibold">
            {state.kind === 'not-found' ? 'Không tìm thấy món này.' : 'Không tải được thông tin món.'}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {state.kind === 'not-found' ? 'Món có thể đã ngừng bán.' : 'Kiểm tra backend đã chạy rồi tải lại trang.'}
          </p>
        </div>
      </main>
    );
  }

  const { product } = state;
  const total = calculatePrice(product.price, size, toppings);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      {back}
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <Image
          src={product.imageUrl || 'https://placehold.co/600x400?text=BrewLite'}
          alt={product.name}
          width={600}
          height={400}
          unoptimized
          priority
          className="aspect-[3/2] w-full rounded-2xl bg-amber-100 object-cover"
        />

        <section>
          <p className="text-sm text-zinc-500">{product.category}</p>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          {product.description && <p className="mt-2 text-zinc-600 dark:text-zinc-400">{product.description}</p>}
          <p className="mt-3 text-lg">
            Giá gốc: <span className="font-semibold">{formatVnd(product.price)}</span>
          </p>

          <ProductOptions size={size} toppings={toppings} onSizeChange={setSize} onToppingsChange={setToppings} />

          <div className="mt-6 flex items-center justify-between rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <span className="font-semibold">Tạm tính</span>
            <span data-testid="total-price" className="text-2xl font-bold">
              {formatVnd(total)}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10" aria-busy="true" aria-label="Đang tải món">
      <div className="grid animate-pulse gap-8 md:grid-cols-2">
        <div className="aspect-[3/2] rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-3">
          <div className="h-8 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-6 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    </main>
  );
}
