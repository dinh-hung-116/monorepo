"use client";

// Task 4.1 + 4.2 + 4.3 + Task 5: trang chi tiết sản phẩm, chọn size/topping/số lượng, tính giá và thêm vào giỏ hàng.
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ApiError,
  getProduct,
  getProductAvailability,
  getToppings,
} from "@/lib/api";
import ProductOptions from "@/components/ProductOptions";
import { useCart } from "@/context/CartContext";
import {
  calculatePrice,
  formatVnd,
  type Size,
  type ToppingId,
} from "@/lib/pricing";
import type { ApiItemAvailability, Product, Topping } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ready"; product: Product };

export default function ProductDetailPage() {
  // useParams cần nằm trong Suspense khi bật cacheComponents (next.config.ts)
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ProductDetail />
    </Suspense>
  );
}

function ProductDetail() {
  const router = useRouter();
  const { addItem } = useCart();
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const validId = Number.isInteger(productId) && productId > 0;
  const [state, setState] = useState<State>(
    validId ? { kind: "loading" } : { kind: "not-found" },
  );
  const [size, setSize] = useState<Size>("S");
  const [toppings, setToppings] = useState<ToppingId[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [toppingsOptions, setToppingsOptions] = useState<Topping[]>([]);
  // Số ly còn lại theo lựa chọn hiện tại; null = không lấy được thông tin tồn kho.
  const [availability, setAvailability] = useState<ApiItemAvailability | null>(
    null,
  );

  useEffect(() => {
    if (!validId) return;
    Promise.all([getProduct(productId), getToppings()])
      .then(([product, loadedToppings]) => {
        setToppingsOptions(loadedToppings);
        setState({ kind: "ready", product });
      })
      .catch((err) =>
        setState({
          kind:
            err instanceof ApiError && err.status === 404
              ? "not-found"
              : "error",
        }),
      );
  }, [productId, validId]);

  // Tồn kho phụ thuộc size + topping + số lượng đang chọn nên phải hỏi lại mỗi lần đổi.
  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    const toppingNames = toppings.map(
      (idItem) => toppingsOptions.find((t) => t.id === idItem)?.name ?? idItem,
    );
    getProductAvailability(productId, {
      size,
      qty: quantity,
      toppings: toppingNames,
    })
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, validId, size, quantity, toppings, toppingsOptions]);

  const back = (
    <Link
      href="/"
      className="text-sm font-medium text-amber-800 hover:underline"
    >
      ← Quay lại menu
    </Link>
  );

  if (state.kind === "loading") return <DetailSkeleton />;

  if (state.kind !== "ready") {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        {back}
        <div
          role="alert"
          className="mt-6 rounded-xl border border-zinc-300 p-8 text-center"
        >
          <p className="font-semibold">
            {state.kind === "not-found"
              ? "Không tìm thấy món này."
              : "Không tải được thông tin món."}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {state.kind === "not-found"
              ? "Món có thể đã ngừng bán."
              : "Kiểm tra backend đã chạy rồi tải lại trang."}
          </p>
        </div>
      </main>
    );
  }

  const { product } = state;
  const unitPrice = calculatePrice(
    product.price,
    size,
    toppings,
    1,
    toppingsOptions,
  );
  const total = calculatePrice(
    product.price,
    size,
    toppings,
    quantity,
    toppingsOptions,
  );
  const notEnoughStock =
    availability !== null &&
    availability.maxCups !== null &&
    availability.maxCups < quantity;

  const handleAddToCart = () => {
    if (notEnoughStock) return;
    const toppingNames = toppings.map(
      (idItem) => toppingsOptions.find((t) => t.id === idItem)?.name ?? idItem,
    );
    addItem({
      productId: String(product.id),
      name: product.name,
      size,
      toppings: toppingNames,
      unitPrice,
      qty: quantity,
    });
    router.push("/cart");
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      {back}
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <Image
          src={product.imageUrl || "https://placehold.co/600x400?text=BrewLite"}
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
          {product.description && (
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {product.description}
            </p>
          )}
          <p className="mt-3 text-lg">
            Giá gốc:{" "}
            <span className="font-semibold">{formatVnd(product.price)}</span>
          </p>
          {availability && availability.maxCups !== null &&
            (notEnoughStock ? (
              <p
                role="status"
                className="mt-1 text-sm font-semibold text-red-700 dark:text-red-400"
              >
                {availability.maxCups <= 0
                  ? "Tạm hết nguyên liệu cho lựa chọn này."
                  : `Chỉ còn đủ ${availability.maxCups} ly với lựa chọn này — hãy giảm số lượng.`}
              </p>
            ) : (
              <p
                role="status"
                className="mt-1 text-sm text-zinc-500 dark:text-zinc-400"
              >
                Còn khoảng {availability.maxCups} ly với lựa chọn này.
              </p>
            ))}

          <ProductOptions
            size={size}
            toppings={toppings}
            onSizeChange={setSize}
            onToppingsChange={setToppings}
            toppingsOptions={toppingsOptions}
          />

          <div className="mt-6 flex items-center justify-between">
            <span className="font-semibold">Số lượng</span>
            <div className="flex items-center rounded-xl border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Giảm số lượng"
                className="flex h-10 w-10 items-center justify-center font-bold text-zinc-600 hover:text-black dark:text-zinc-300"
              >
                -
              </button>
              <span className="w-10 text-center font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Tăng số lượng"
                className="flex h-10 w-10 items-center justify-center font-bold text-zinc-600 hover:text-black dark:text-zinc-300"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <span className="font-semibold">Tạm tính</span>
            <span data-testid="total-price" className="text-2xl font-bold">
              {formatVnd(total)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={notEnoughStock}
            className="mt-4 w-full rounded-xl bg-amber-800 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {notEnoughStock
              ? "Tạm hết nguyên liệu"
              : `+ Thêm vào giỏ (${formatVnd(total)})`}
          </button>
        </section>
      </div>
    </main>
  );
}

function DetailSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-4xl px-4 py-10"
      aria-busy="true"
      aria-label="Đang tải món"
    >
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
