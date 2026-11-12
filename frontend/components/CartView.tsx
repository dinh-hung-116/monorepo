"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_BASE_URL, useAuth } from "@/context/AuthContext";
import { DrinkSize, useCart } from "@/context/CartContext";
import {
  createPayment,
  getProducts,
  getToppings,
  validatePromotion,
} from "@/lib/api";
import {
  calculatePrice,
  formatVnd,
  SIZES,
  type ToppingId,
} from "@/lib/pricing";
import type { Product, Topping } from "@/lib/types";

interface CreatedOrderInfo {
  id: string;
  orderCode: string;
  status: string;
  total: number;
}

export default function CartView() {
  const {
    items,
    totalItems,
    totalAmount,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();
  const { accessToken, isAuthenticated, user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<DrinkSize>("M");
  const [selectedToppings, setSelectedToppings] = useState<ToppingId[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderInfo | null>(
    null,
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [discountedTotal, setDiscountedTotal] = useState<number | null>(null);
  const [validatedSubtotal, setValidatedSubtotal] = useState<number | null>(
    null,
  );
  const [promotionDiscountLabel, setPromotionDiscountLabel] = useState<
    string | null
  >(null);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [validatingPromotion, setValidatingPromotion] = useState(false);
  const lastPromotionCheckRef = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([getProducts(), getToppings()])
      .then(([loadedProducts, loadedToppings]) => {
        setProducts(loadedProducts);
        setToppings(loadedToppings);
        setSelectedDrink(loadedProducts[0] ?? null);
      })
      .catch(() => setCatalogError("Không tải được menu từ máy chủ."));
  }, []);

  // Xóa kết quả đơn hàng cũ và thông báo lỗi khi tài khoản thay đổi hoặc đăng xuất
  useEffect(() => {
    setCreatedOrder(null);
    setOrderError(null);
  }, [user?.id, isAuthenticated]);

  const checkPromotion = useCallback(async () => {
    const code = promotionCode.trim();
    const checkKey = `${code}:${totalAmount}`;
    if (lastPromotionCheckRef.current === checkKey) return;
    lastPromotionCheckRef.current = checkKey;
    setPromotionError(null);
    setDiscountedTotal(null);
    setValidatedSubtotal(null);
    setPromotionDiscountLabel(null);
    if (!code) return;
    setValidatingPromotion(true);
    try {
      const result = await validatePromotion(code, totalAmount);
      setDiscountedTotal(result.total);
      setValidatedSubtotal(totalAmount);
      setPromotionDiscountLabel(
        result.discountType === "PERCENTAGE"
          ? `${result.discountValue}%`
          : formatVnd(result.discountValue),
      );
    } catch (error) {
      setPromotionError(
        error instanceof Error ? error.message : "Mã khuyến mãi không hợp lệ.",
      );
    } finally {
      setValidatingPromotion(false);
    }
  }, [promotionCode, totalAmount]);

  const handlePromotionBlur = () => {
    void checkPromotion();
  };

  useEffect(() => {
    if (promotionCode.trim()) {
      void checkPromotion();
    }
  }, [totalAmount]);

  const toggleTopping = (toppingId: ToppingId) => {
    setSelectedToppings((prev) =>
      prev.includes(toppingId)
        ? prev.filter((t) => t !== toppingId)
        : [...prev, toppingId],
    );
  };

  const currentUnitPrice = calculatePrice(
    selectedDrink?.price ?? 0,
    selectedSize,
    selectedToppings,
    1,
    toppings,
  );

  const handleQuickAdd = () => {
    if (!selectedDrink) return;
    setCreatedOrder(null);
    setOrderError(null);
    const toppingNames = selectedToppings.map(
      (id) => toppings.find((t) => t.id === id)?.name ?? id,
    );
    addItem({
      productId: String(selectedDrink.id),
      name: selectedDrink.name,
      size: selectedSize,
      toppings: toppingNames,
      unitPrice: currentUnitPrice,
      qty: 1,
    });
  };

  const handlePayment = async () => {
    if (items.length === 0) return;
    if (!isAuthenticated || !accessToken) {
      setOrderError("Vui lòng đăng nhập trước khi đặt đơn hàng.");
      return;
    }

    setSubmitting(true);
    setOrderError(null);
    setCreatedOrder(null);

    try {
      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            productName: item.name,
            size: item.size,
            toppings: item.toppings,
            qty: item.qty,
            unitPrice: item.unitPrice,
          })),
          promotionCode: promotionCode.trim() || undefined,
        }),
      });

      const order = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(order?.message)
          ? order.message.join(", ")
          : order?.message || "Không thể tạo đơn hàng";
        throw new Error(msg);
      }

      if (!accessToken) {
        throw new Error("Vui lòng đăng nhập để thanh toán.");
      }
      const { paymentUrl } = await createPayment(order.orderCode, accessToken);
      window.location.href = paymentUrl;
      setSubmitting(true);
      setOrderError(null);
      setCreatedOrder(null);
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : "Lỗi kết nối tới máy chủ",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6 md:grid-cols-12">
      {/* Cột trái: thêm nhanh món từ menu trong database */}
      <section className="flex flex-col rounded-2xl border border-amber-200 bg-white p-5 shadow-sm md:col-span-5">
        <h2 className="text-lg font-bold text-zinc-900">
          Thêm đồ uống vào giỏ
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Chọn đồ uống, size (S/M/L) và topping để thêm vào giỏ hàng
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
              Đồ uống
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {products.map((drink) => {
                const active = drink.id === selectedDrink?.id;
                return (
                  <button
                    key={drink.id}
                    type="button"
                    onClick={() => setSelectedDrink(drink)}
                    className={`rounded-xl border p-2.5 text-left text-sm transition ${
                      active
                        ? "border-amber-800 bg-amber-50 font-semibold text-amber-950"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <div>{drink.name}</div>
                    <div className="text-xs text-zinc-500">
                      {formatVnd(drink.price)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
              Size
            </label>
            <div className="mt-1.5 flex gap-2">
              {SIZES.map(({ size, extra }) => {
                const active = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                      active
                        ? "border-amber-800 bg-amber-800 text-white"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    Size {size} {extra > 0 ? `(+${extra / 1000}k)` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
              Topping
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {toppings.map((topping) => {
                const active = selectedToppings.includes(topping.id);
                return (
                  <button
                    key={topping.id}
                    type="button"
                    onClick={() => toggleTopping(topping.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-amber-700 bg-amber-100 text-amber-950"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {active ? "✓ " : "+ "}
                    {topping.name} (+{formatVnd(topping.price)})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleQuickAdd}
              disabled={!selectedDrink || Boolean(catalogError)}
              className="w-full rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-900"
            >
              + Thêm vào giỏ ({formatVnd(currentUnitPrice)})
            </button>
          </div>
        </div>
        {catalogError && (
          <p className="mt-3 text-sm text-red-700">{catalogError}</p>
        )}
      </section>

      {/* Cột phải: Danh sách giỏ hàng, chỉnh sửa số lượng, xóa và Đặt đơn */}
      <section className="flex h-full flex-col rounded-2xl border border-amber-200 bg-white p-5 shadow-sm md:col-span-7">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">
              Giỏ hàng của bạn
            </h1>
            <p className="text-xs text-zinc-500">
              Tổng số lượng:{" "}
              <strong data-testid="cart-total-items">{totalItems}</strong> món
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Xóa tất cả
            </button>
          )}
        </div>

        {createdOrder && (
          <div
            data-testid="order-success"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
          >
            <div className="text-base font-bold">✓ Đặt hàng thành công!</div>
            <div className="mt-1 text-sm">
              Mã đơn: <strong>{createdOrder.orderCode}</strong> — Trạng thái:{" "}
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                {createdOrder.status}
              </span>
            </div>
            <div className="mt-1 text-xs text-emerald-700">
              Tổng thanh toán: {formatVnd(createdOrder.total)}
            </div>
          </div>
        )}

        {orderError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {orderError}
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">
            Giỏ hàng đang trống. Hãy chọn đồ uống bên trái để thêm vào giỏ!
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((item) => {
              const lineTotal = item.unitPrice * item.qty;
              return (
                <li
                  key={item.cartItemId}
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="font-semibold text-zinc-900">
                      {item.name}{" "}
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                        Size {item.size}
                      </span>
                    </div>
                    {item.toppings.length > 0 && (
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Topping: {item.toppings.join(", ")}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-zinc-500">
                      Đơn giá: {formatVnd(item.unitPrice)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="flex items-center rounded-lg border border-zinc-300">
                      <button
                        type="button"
                        aria-label={`Giảm số lượng ${item.name}`}
                        onClick={() =>
                          updateQuantity(item.cartItemId, item.qty - 1)
                        }
                        className="px-2.5 py-1 text-sm font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        -
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold text-zinc-900">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`Tăng số lượng ${item.name}`}
                        onClick={() =>
                          updateQuantity(item.cartItemId, item.qty + 1)
                        }
                        className="px-2.5 py-1 text-sm font-bold text-zinc-700 hover:bg-zinc-100"
                      >
                        +
                      </button>
                    </div>

                    <div className="min-w-20 text-right font-semibold text-amber-900">
                      {formatVnd(lineTotal)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.cartItemId)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Xóa
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-auto border-t border-zinc-200 pt-4">
          <div className="mt-4">
            <label className="flex items-center gap-3 text-sm font-semibold text-zinc-700">
              <span className="shrink-0">Mã khuyến mãi</span>
              <span className="relative min-w-0 flex-1">
                <input
                  type="text"
                  value={promotionCode}
                  onChange={(event) => {
                    setPromotionCode(event.target.value);
                    lastPromotionCheckRef.current = null;
                    setDiscountedTotal(null);
                    setValidatedSubtotal(null);
                    setPromotionDiscountLabel(null);
                    setPromotionError(null);
                  }}
                  onBlur={handlePromotionBlur}
                  placeholder="Ví dụ: WELCOME10"
                  maxLength={50}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 pr-9 font-normal uppercase outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-200"
                />
                {validatingPromotion && (
                  <span
                    aria-label="Đang kiểm tra mã khuyến mãi"
                    className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-amber-200 border-t-amber-800"
                  />
                )}
              </span>
            </label>
            {promotionError && (
              <p role="alert" className="mt-1 text-xs text-red-700">
                {promotionError}
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm">
            <div className="flex items-center justify-between text-zinc-600">
              <span>Tạm tính</span>
              <span>{formatVnd(totalAmount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-emerald-700">
              <span>
                Giảm giá
                {validatedSubtotal === totalAmount && promotionDiscountLabel ? (
                  <span className="ml-1 text-xs font-medium">
                    ({promotionDiscountLabel})
                  </span>
                ) : null}
              </span>
              <span>
                {formatVnd(
                  validatedSubtotal === totalAmount && discountedTotal !== null
                    ? totalAmount - discountedTotal
                    : 0,
                )}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 text-base font-bold text-zinc-900">
              <span>Tổng tiền</span>
              <span
                data-testid="cart-total-amount"
                className="text-xl text-amber-900"
              >
                {formatVnd(
                  validatedSubtotal === totalAmount
                    ? discountedTotal
                    : totalAmount,
                )}
              </span>
            </div>
          </div>

          {!isAuthenticated && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              Bạn cần{" "}
              <Link href="/login" className="font-bold underline">
                Đăng nhập
              </Link>{" "}
              hoặc{" "}
              <Link href="/register" className="font-bold underline">
                Đăng ký
              </Link>{" "}
              để gửi yêu cầu đặt đơn (route <code>POST /orders</code> được bảo
              vệ bởi JWT Guard).
            </div>
          )}

          <button
            type="button"
            disabled={items.length === 0 || submitting}
            onClick={handlePayment}
            className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Đang chuyển tới cổng thanh toán" : "Thanh toán"}
          </button>
        </div>
      </section>
    </div>
  );
}
