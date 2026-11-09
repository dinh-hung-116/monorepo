# BrewLite Monorepo (Công nghệ Phần mềm)

Ứng dụng đặt đồ uống không dùng tiền mặt **BrewLite** với kiến trúc Monorepo gồm:
- `frontend`: Next.js (App Router, TypeScript, TailwindCSS)
- `backend`: NestJS (REST API, Prisma + PostgreSQL, `class-validator`, JWT Passport, `bcrypt`)

## Các tác vụ đã hoàn thiện (Sprint 2: Task 5, Task 6, Task 7)

### Task 5: Giỏ hàng (Cart)
- **Store giỏ hàng (`frontend/context/CartContext.tsx`)**: Quản lý state giỏ hàng bằng React Context kết hợp lưu trữ bền vững trên `localStorage`. Hỗ trợ `addItem`, `updateQuantity`, `removeItem`, `clearCart`, tự động tính tổng số lượng (`totalItems` hiển thị trên badge) và tổng tiền (`totalAmount`).
- **Giao diện giỏ hàng (`frontend/components/CartView.tsx`, `frontend/components/Header.tsx`, `frontend/app/cart/page.tsx`)**:
  - Thêm sản phẩm kèm tùy chọn Size (`S`/`M`/`L`) và Topping (`Trân châu`, `Kem`).
  - Tăng/giảm số lượng, xóa từng món hoặc xóa toàn bộ giỏ.
  - Badge số lượng cập nhật theo thời gian thực trên thanh điều hướng.

### Task 6: API tạo đơn hàng (`POST /orders`)
- **Controller & Service (`backend/src/orders/`)**:
  - `POST /orders` nhận danh sách món trong giỏ hàng, kiểm tra dữ liệu đầu vào bằng `class-validator` (`CreateOrderDto`, `CreateOrderItemDto`), tự tính `lineTotal` và `total`, lưu đơn ở trạng thái `PENDING` vào database (`orders`, `order_items`) qua Prisma và trả về mã đơn (`orderCode`, ví dụ `#1001`).
  - `GET /orders/me` trả về danh sách đơn hàng của người dùng hiện tại từ database.
- **Kiểm thử API**:
  - Unit test: `backend/src/orders/orders.controller.spec.ts`
  - E2E test: `backend/test/app.e2e-spec.ts`

### Task 7: Đăng ký / Đăng nhập (JWT + Database Persistence)
- **Database Schema (`backend/prisma/schema.prisma`)**:
  - Bổ sung bảng `users`, `orders`, `order_items` kèm migration `20261107091755_create_users_and_orders`.
- **API xác thực (`backend/src/auth/`)**:
  - `POST /auth/register`: Validate email/mật khẩu, băm mật khẩu bằng `bcrypt`, lưu tài khoản vào bảng `users` trong database qua `PrismaService` và phát JWT (`accessToken`).
  - `POST /auth/login`: Tra cứu tài khoản trong database, xác thực mật khẩu với `bcrypt.compare` và phát JWT (`accessToken`).
  - `GET /auth/me`: Lấy thông tin tài khoản người dùng hiện tại từ database.
  - `JwtStrategy` & `JwtAuthGuard` bảo vệ route đặt đơn `POST /orders`.
- **Giao diện Đăng ký / Đăng nhập (`frontend/components/AuthForm.tsx`, `frontend/app/login/page.tsx`, `frontend/app/register/page.tsx`)**:
  - Form đăng ký và đăng nhập có kiểm tra dữ liệu, hiển thị trạng thái loading/lỗi, lưu JWT vào `AuthContext` và đồng bộ trạng thái tài khoản từ database qua `GET /auth/me`.

---

## Hướng dẫn cài đặt và chạy dự án

### 1. Chạy Backend (NestJS - Port 3001)
```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run start:dev
```

Kiểm thử Backend (Unit test & E2E test):
```bash
cd backend
npm test
npm run test:e2e
```

### 2. Chạy Frontend (Next.js - Port 3000)
```bash
cd frontend
npm install
npm run dev
```
Truy cập ứng dụng tại `http://localhost:3000` (hoặc `http://localhost:3000/cart`, `http://localhost:3000/login`, `http://localhost:3000/register`).
