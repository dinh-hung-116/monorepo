"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface AuthFormProps {
  mode: "login" | "register";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password, name || undefined);
      } else {
        await login(email, password);
      }
      router.push("/cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-zinc-900">
        {isRegister ? "Đăng ký tài khoản" : "Đăng nhập BrewLite"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        {isRegister
          ? "Tạo tài khoản mới để đặt đồ uống không tiền mặt."
          : "Đăng nhập để nhận JWT và tiến hành đặt đơn hàng."}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {isRegister && (
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-700"
            >
              Tên hiển thị (tùy chọn)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-zinc-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@brewlite.vn"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-700"
          >
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ít nhất 6 ký tự"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-900 disabled:opacity-60"
        >
          {loading
            ? "Đang xử lý..."
            : isRegister
              ? "Đăng ký"
              : "Đăng nhập"}
        </button>
      </form>

      <div className="mt-5 text-center text-sm text-zinc-600">
        {isRegister ? (
          <>
            Đã có tài khoản?{" "}
            <Link
              href="/login"
              className="font-semibold text-amber-800 hover:underline"
            >
              Đăng nhập ngay
            </Link>
          </>
        ) : (
          <>
            Chưa có tài khoản?{" "}
            <Link
              href="/register"
              className="font-semibold text-amber-800 hover:underline"
            >
              Đăng ký ngay
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
