'use client';

// Hook quản lý giỏ hàng lưu ở localStorage, tự động tính tổng tiền & badge (Tùng).
import { useEffect, useState } from 'react';
import {
  addItemToCart,
  calculateCartTotals,
  removeItemFromCart,
  updateItemQuantity,
  type CartItem,
} from './cart.ts';
import type { Size, ToppingId } from './pricing.ts';

const STORAGE_KEY = 'brewlite_cart';

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Đọc từ localStorage khi load trang
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch {
      // Bỏ qua nếu lỗi parse
    }
    setIsLoaded(true);

    const onStorage = () => {
      try {
        const updated = localStorage.getItem(STORAGE_KEY);
        if (updated) setItems(JSON.parse(updated));
      } catch {}
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('brewlite_cart_updated', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('brewlite_cart_updated', onStorage);
    };
  }, []);

  const saveItems = (newItems: CartItem[]) => {
    setItems(newItems);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
      window.dispatchEvent(new Event('brewlite_cart_updated'));
    } catch {}
  };

  const add = (item: {
    productId: number;
    name: string;
    imageUrl?: string;
    basePrice: number;
    size: Size;
    toppings: ToppingId[];
    quantity?: number;
  }) => {
    const updated = addItemToCart(items, item);
    saveItems(updated);
  };

  const updateQty = (id: string, qty: number) => {
    const updated = updateItemQuantity(items, id, qty);
    saveItems(updated);
  };

  const remove = (id: string) => {
    const updated = removeItemFromCart(items, id);
    saveItems(updated);
  };

  const clear = () => {
    saveItems([]);
  };

  const totals = calculateCartTotals(items);

  return {
    items,
    isLoaded,
    totalItems: totals.totalItems,
    totalPrice: totals.totalPrice,
    addItem: add,
    updateQuantity: updateQty,
    removeItem: remove,
    clearCart: clear,
  };
}

