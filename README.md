# BrewLite Monorepo (Công nghệ Phần mềm)

Ứng dụng đặt đồ uống không dùng tiền mặt **BrewLite** với kiến trúc Monorepo gồm:
- `frontend`: Next.js (App Router, TypeScript, TailwindCSS)
- `backend`: NestJS (REST API, Prisma + PostgreSQL, `class-validator`, JWT Passport, `bcrypt`)

---

## Tổng hợp các Task đã hoàn thiện (Sprint 1 & Sprint 2)

### Sprint 1 – Task 1, 2, 3, 4

| Mã | Việc | File |
| --- | --- | --- |
| 1 | Khởi tạo Monorepo (`frontend` Next.js + `backend` NestJS), `GET /` trả `"Hello World!"`, `.env.example`, `README.md` | `frontend/`, `backend/`, `.env.example`, `README.md` |
| 2.1 | Seed 8 sản phẩm và dữ liệu liên kết cho toàn bộ bảng (Prisma + PostgreSQL) | `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, `backend/prisma/seed.ts` |
| 2.2 | `GET /products`, `GET /products/:id` (404 khi không có, 400 khi id không phải số) | `backend/src/products/` |
| 2.3 | Kiểm thử API sản phẩm (Unit + E2E), thời gian phản hồi `< 500ms` | `backend/test/products.e2e-spec.ts` |
| 3.1 | Service gọi API: timeout 8 giây, phân biệt 404 / lỗi máy chủ / mất kết nối | `frontend/lib/api.ts` (test: `api.test.ts`) |
| 3.2 | Giao diện lưới sản phẩm (hình, tên, giá) | `frontend/app/page.tsx` |
| 3.3 | Trạng thái loading / empty / lỗi (có nút Thử lại) | `frontend/app/page.tsx` |
| 4.1 | Giao diện trang chi tiết sản phẩm | `frontend/app/products/[id]/page.tsx` |
| 4.2 | Chọn size (S/M/L), topping và số lượng | `frontend/components/ProductOptions.tsx`, `frontend/lib/options.ts` |
| 4.3 | Tính giá theo tùy chọn size + topping + số lượng | `frontend/lib/pricing.ts` (test: `pricing.test.ts`) |

### Sprint 2 – Task 5, 6, 7

| Mã | Việc | File |
| --- | --- | --- |
| 5.1 | Store giỏ hàng (React Context + `localStorage` + helper `lib/cart.ts`) | `frontend/context/CartContext.tsx`, `frontend/lib/cart.ts` (test: `cart.test.ts`) |
| 5.2 | Giao diện giỏ hàng: thêm/sửa số lượng/xóa món hoặc xóa tất cả | `frontend/components/CartView.tsx`, `frontend/app/cart/page.tsx` |
| 5.3 | Tự tính tổng tiền và hiển thị badge số lượng trên thanh điều hướng | `frontend/components/Header.tsx`, `frontend/context/CartContext.tsx` |
| 6.1 | DTO và validate giỏ hàng đầu vào bằng `class-validator` (`ValidationPipe`) | `backend/src/orders/dto/create-order.dto.ts`, `backend/src/main.ts` |
| 6.2 | Entity & Prisma model `orders` / `order_items`, lưu đơn trạng thái `PENDING` | `backend/prisma/schema.prisma`, `backend/src/orders/entities/order.entity.ts`, `backend/src/orders/orders.service.ts` |
| 6.3 | Controller `POST /orders` trả mã đơn (`orderCode`), `GET /orders/me`, `GET /orders/:code` | `backend/src/orders/orders.controller.ts` |
| 6.4 | Kiểm thử API đặt đơn (Unit + E2E) | `backend/src/orders/orders.controller.spec.ts`, `backend/src/orders/orders.service.spec.ts`, `backend/test/app.e2e-spec.ts` |
| 7.1 | Entity & Prisma model `users`, băm mật khẩu bằng `bcrypt` | `backend/prisma/schema.prisma`, `backend/src/auth/auth.service.ts` (test: `auth.service.spec.ts`) |
| 7.2 | API `POST /auth/register`, `POST /auth/login`, `GET /auth/me` và phát JWT | `backend/src/auth/auth.controller.ts` (test: `auth.controller.spec.ts`) |
| 7.3 | `JwtStrategy` & `JwtAuthGuard` bảo vệ route đặt đơn `POST /orders` | `backend/src/auth/jwt.strategy.ts`, `backend/src/auth/jwt-auth.guard.ts` |
| 7.4 | Form đăng ký / đăng nhập (Frontend) và đồng bộ phiên đăng nhập | `frontend/context/AuthContext.tsx`, `frontend/components/AuthForm.tsx`, `frontend/app/login/page.tsx`, `frontend/app/register/page.tsx` |

---

## Hướng dẫn cài đặt và chạy dự án

### 1. Khởi tạo PostgreSQL (Tùy chọn – có cơ chế fallback dữ liệu mẫu khi chạy local không cần Docker)
```bash
docker run -d --name brewlite-db -e POSTGRES_USER=brewlite -e POSTGRES_PASSWORD=brewlite -e POSTGRES_DB=brewlite -p 5432:5432 postgres:16-alpine
```

### 2. Chạy Backend (NestJS – Port 3001)
```bash
cd backend
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run db:migrate            # nếu dùng PostgreSQL
npm run db:seed               # seed products, users, orders, inventory, promotions và payments
npm run start:dev
```

Tài khoản mẫu sau khi seed đều dùng mật khẩu `BrewLite123!`: `customer@brewlite.test`,
`staff@brewlite.test` và `admin@brewlite.test`. Seed có thể chạy lại an toàn mà không
tạo bản ghi trùng.

### 3. Chạy Frontend (Next.js – Port 3000)
```bash
cd frontend
npm install
npm run dev
```
Truy cập ứng dụng tại `http://localhost:3000` (hoặc `/cart`, `/login`, `/register`).

### 4. Chạy cả 3 phần bằng Docker Compose

Stack gồm 3 service độc lập: `db` (PostgreSQL), `backend` (NestJS), `frontend` (Next.js).

```bash
docker compose up -d --build     # lần đầu / khi code thay đổi
docker compose ps                # xem trạng thái
docker compose logs -f backend   # xem log
```

| Service | Địa chỉ |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:3001` |
| PostgreSQL | `localhost:5434` (user/pass/db: `brewlite` / `brewlite` / `brewlite_db`) |

- Backend tự chạy `prisma migrate deploy` khi container khởi động.
- Dữ liệu DB nằm trong volume riêng `brewlite_stack_db_data` (không dùng chung với container nào khác).
- Seed thêm dữ liệu mẫu: `docker compose run --rm backend npm run db:seed`.
- Đổi port/cấu hình DB: sửa biến `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, hoặc đặt chúng trong file `.env` ở thư mục gốc.
- Dừng: `docker compose down` (giữ dữ liệu) hoặc `docker compose down -v` (xoá luôn volume).

---

## Kiểm thử & Build

```bash
# Backend: Unit test, E2E test, Lint, Build
cd backend
npm test
npm run test:e2e
npm run lint
npm run build

# Frontend: Unit test, Lint, Build
cd frontend
npm test
npm run lint
npm run build
```
