"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";

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

const CART_STORAGE_PREFIX = "brewlite_cart_user_";
const CART_GUEST_STORAGE_KEY = "brewlite_cart_guest";
const LEGACY_STORAGE_KEY = "brewlite_cart_v1";

function getCartStorageKey(userId: string | null): string {
  return userId ? `${CART_STORAGE_PREFIX}${userId}` : CART_GUEST_STORAGE_KEY;
}

function readStoredCart(userId: string | null): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const key = getCartStorageKey(userId);
    let raw = window.localStorage.getItem(key);
    // Hỗ trợ chuyển đổi dữ liệu từ khóa cũ brewlite_cart_v1
    if (!raw && !userId) {
      raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return [];
}

function writeStoredCart(userId: string | null, items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const key = getCartStorageKey(userId);
    if (items.length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(items));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function useCurrentUserId(): string | null {
  try {
    const auth = useAuth();
    return auth.user?.id ? String(auth.user.id) : null;
  } catch {
    return null;
  }
}

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
  const currentUserId = useCurrentUserId();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const activeUserIdRef = useRef<string | null | undefined>(undefined);

  // Đồng bộ giỏ hàng theo từng tài khoản người dùng
  useEffect(() => {
    const prevUserId = activeUserIdRef.current;

    // Khi khách thêm món vào giỏ rồi mới đăng nhập: gộp giỏ của khách vào tài khoản
    if (prevUserId === null && currentUserId) {
      const guestItems = readStoredCart(null);
      const userItems = readStoredCart(currentUserId);
      const combined = [...userItems, ...guestItems];
      window.localStorage.removeItem(CART_GUEST_STORAGE_KEY);
      writeStoredCart(currentUserId, combined);
      setItems(combined);
    } else {
      // Đọc giỏ hàng tương ứng với tài khoản hiện tại (hoặc giỏ trống khi đăng xuất)
      const saved = readStoredCart(currentUserId);
      setItems(saved);
    }

    activeUserIdRef.current = currentUserId;
    setIsHydrated(true);
  }, [currentUserId]);

  // Tự động lưu giỏ hàng vào localStorage theo userId
  useEffect(() => {
    if (!isHydrated) return;
    if (activeUserIdRef.current === currentUserId) {
      writeStoredCart(currentUserId, items);
    }
  }, [items, isHydrated, currentUserId]);

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
    writeStoredCart(currentUserId, []);
  }, [currentUserId]);

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
