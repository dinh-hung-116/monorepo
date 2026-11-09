"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type DrinkSize = "S" | "M" | "L";

export interface CartItem {
  cartItemId: string;
  productId: string;
  name: string;
  size: DrinkSize;
  toppings: string[];
  unitPrice: number;
  qty: number;
}

export interface AddCartItemInput {
  productId: string;
  name: string;
  size: DrinkSize;
  toppings?: string[];
  unitPrice: number;
  qty?: number;
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  addItem: (input: AddCartItemInput) => void;
  updateQuantity: (cartItemId: string, qty: number) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;
}

const CART_STORAGE_KEY = "brewlite_cart_v1";

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function buildCartItemId(
  productId: string,
  size: DrinkSize,
  toppings: string[] = []
): string {
  const normalizedToppings = [...toppings].sort().join(",");
  return `${productId}__${size}__${normalizedToppings}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {
      // Ignore storage read errors
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage quota errors
    }
  }, [items, isHydrated]);

  const addItem = useCallback((input: AddCartItemInput) => {
    const toppings = input.toppings ? [...input.toppings].sort() : [];
    const qtyToAdd = input.qty && input.qty > 0 ? input.qty : 1;
    const cartItemId = buildCartItemId(input.productId, input.size, toppings);

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.cartItemId === cartItemId
      );
      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex ? { ...item, qty: item.qty + qtyToAdd } : item
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          productId: input.productId,
          name: input.name,
          size: input.size,
          toppings,
          unitPrice: input.unitPrice,
          qty: qtyToAdd,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((cartItemId: string) => {
    setItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback(
    (cartItemId: string, qty: number) => {
      if (qty <= 0) {
        removeItem(cartItemId);
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.cartItemId === cartItemId ? { ...item, qty } : item
        )
      );
    },
    [removeItem]
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items]
  );

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      totalItems,
      totalAmount,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [
      items,
      totalItems,
      totalAmount,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart phải được sử dụng bên trong CartProvider");
  }
  return context;
}
