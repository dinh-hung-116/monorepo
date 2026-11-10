"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  phone?: string | null;
  role?: string;
  loyaltyPoints?: number;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (
    email: string,
    password: string,
    name?: string
  ) => Promise<AuthResponse>;
  logout: () => void;
}

const AUTH_STORAGE_KEY = "brewlite_auth_v1";
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function persistAuthSession(accessToken: string | null, user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (accessToken && user) {
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ accessToken, user })
      );
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Khôi phục phiên đăng nhập từ localStorage và đồng bộ thông tin tài khoản từ database (GET /auth/me)
  useEffect(() => {
    let savedToken: string | null = null;
    let savedUser: AuthUser | null = null;

    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.accessToken && parsed?.user) {
          savedToken = parsed.accessToken;
          savedUser = parsed.user;
        }
      }
    } catch {
      // Ignore storage errors
    }

    Promise.resolve().then(() => {
      if (savedToken && savedUser) {
        setAccessToken(savedToken);
        setUser(savedUser);
      }
      setIsHydrated(true);
    });

    if (savedToken) {
      const tokenToVerify = savedToken;
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tokenToVerify}` },
      })
        .then(async (res) => {
          if (res.ok) {
            const dbUser = (await res.json()) as AuthUser;
            setUser(dbUser);
            persistAuthSession(tokenToVerify, dbUser);
          } else if (res.status === 401) {
            setAccessToken(null);
            setUser(null);
            persistAuthSession(null, null);
          }
        })
        .catch(() => {
          // Giữ phiên local nếu máy chủ tạm thời chưa phản hồi
        });
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    persistAuthSession(accessToken, user);
  }, [accessToken, user, isHydrated]);

  const login = async (
    email: string,
    password: string
  ): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message || "Đăng nhập thất bại";
      throw new Error(message);
    }

    setAccessToken(data.accessToken);
    setUser(data.user);
    persistAuthSession(data.accessToken, data.user);
    return data;
  };

  const register = async (
    email: string,
    password: string,
    name?: string
  ): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message || "Đăng ký thất bại";
      throw new Error(message);
    }

    setAccessToken(data.accessToken);
    setUser(data.user);
    persistAuthSession(data.accessToken, data.user);
    return data;
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    persistAuthSession(null, null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("brewlite_cart_guest");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: Boolean(accessToken && user),
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth phải được sử dụng bên trong AuthProvider");
  }
  return context;
}
