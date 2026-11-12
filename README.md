# BrewLite

Ứng dụng đặt đồ uống không dùng tiền mặt **BrewLite**, viết theo mô hình monorepo:

| Thư mục | Công nghệ | Cổng |
| --- | --- | --- |
| `frontend/` | Next.js 16 (App Router, TypeScript, TailwindCSS, React 19) | 3000 |
| `backend/` | NestJS 12 (REST API, Prisma 6 + PostgreSQL, JWT, `class-validator`, `bcrypt`) | 3001 |
| `docker-compose.yml` | PostgreSQL 18 + backend + frontend (project `brewlite-stack`) | 5434 → 5432 |

Tính năng chính: xem menu và chi tiết món, chọn size/topping, giỏ hàng, đặt đơn (giữ chỗ nguyên liệu theo tồn kho thật), thanh toán VNPay sandbox, mã khuyến mãi, tích điểm, huỷ đơn, kiểm kho cho nhân viên, tự huỷ đơn `PENDING` quá hạn.

---

## 1. Yêu cầu

- **Node.js 22** (Dockerfile dùng `node:22-bookworm-slim`) và npm.
- **PostgreSQL 18** (hoặc 16+) nếu chạy không Docker — hoặc chỉ cần Docker để chạy riêng DB.
- Docker Desktop nếu chạy bằng container.

---

## 2. Chạy bằng Docker (khuyến nghị)

Toàn bộ stack (DB + backend + frontend) nằm trong `docker-compose.yml`, project name `brewlite-stack`.

```bash
docker compose up -d --build      # build image và chạy 3 service
docker compose ps                 # xem trạng thái
docker compose logs -f backend    # xem log backend
```

| Service | Địa chỉ | Ghi chú |
| --- | --- | --- |
| Frontend | http://localhost:3000 | Next.js production (`next start`) |
| Backend | http://localhost:3001 | tự chạy `prisma migrate deploy` khi khởi động |
| PostgreSQL | `localhost:5434` | user/pass/db: `brewlite` / `brewlite` / `brewlite_db` |

- Dữ liệu DB nằm trong volume riêng **`brewlite_stack_db_data`**, tách khỏi mọi container/DB khác trên máy.
- Cổng 5434 ở host để không đụng PostgreSQL cài sẵn (5432) hay stack `brewlite` cũ (5433).

### Nạp dữ liệu mẫu vào container

```bash
docker compose run --rm backend npm run db:seed
```

### Các lệnh thường dùng

```bash
docker compose down                    # dừng, giữ nguyên dữ liệu
docker compose down -v                 # dừng và XOÁ volume (mất dữ liệu)
docker compose up -d --build backend   # build lại riêng backend
docker compose up -d --build frontend  # build lại riêng frontend
docker compose exec db psql -U brewlite -d brewlite_db   # vào psql trong container
```

> **Lưu ý:** container chiếm cổng 3000/3001, nên phải tắt dev server local (`next dev`, `nest start --watch`) trước khi `docker compose up`. Ngược lại, muốn chạy dev thì `docker compose down` trước.

### Cấu hình

Các biến trong `.env` ở thư mục gốc được Docker Compose đọc (xem `.env.example`):

| Biến | Mặc định |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `brewlite` / `brewlite` / `brewlite_db` |
| `JWT_SECRET` | `brewlite_super_secret_jwt_key_2026` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` (nhúng vào JS lúc **build**, đổi thì phải build lại frontend) |

---

## 3. Chạy không dùng Docker

### 3.1. Chuẩn bị PostgreSQL

Có DB tên `brewlite` (không cần Docker cũng được, ví dụ PostgreSQL cài sẵn ở cổng 5432). Nếu muốn dùng Docker chỉ cho DB:

```bash
docker run -d --name brewlite-db \
  -e POSTGRES_USER=brewlite -e POSTGRES_PASSWORD=brewlite -e POSTGRES_DB=brewlite \
  -p 5432:5432 postgres:18-alpine
```

### 3.2. Backend (cổng 3001)

```bash
cd backend
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm install               # postinstall tự chạy prisma generate
npm run db:migrate        # prisma migrate deploy – tạo toàn bộ bảng
npm run db:seed           # nạp dữ liệu mẫu (xem mục 4)
npm run start:dev         # chế độ watch
```

Sửa `backend/.env` cho đúng máy:

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | chuỗi kết nối PostgreSQL, ví dụ `postgresql://postgres:matkhau@localhost:5432/brewlite` |
| `PORT` | cổng API (mặc định 3001) |
| `CORS_ORIGIN` | origin của frontend (mặc định `http://localhost:3000`) |
| `JWT_SECRET` | khoá ký JWT |
| `vnpay.tmn-code`, `vnpay.hash-secret`, `vnpay.payment-url` | thông tin VNPay sandbox cho luồng thanh toán |

### 3.3. Frontend (cổng 3000)

```bash
cd frontend
npm install
npm run dev
```

Tạo `frontend/.env.local` nếu API không ở cổng mặc định:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Mở http://localhost:3000 (các trang: `/cart`, `/login`, `/register`, `/orders`, `/products/[id]`).

---

## 4. Dữ liệu mẫu lấy ở đâu?

**Nguồn duy nhất:** [`backend/prisma/seed.ts`](backend/prisma/seed.ts), chạy bằng `npm run db:seed`
(`prisma db seed` → `tsx prisma/seed.ts`). Cấu trúc bảng do `backend/prisma/migrations/` quy định.

Seed tạo (dùng `upsert`, chạy lại nhiều lần **không** tạo bản ghi trùng và **không** ghi đè tồn kho đang có):

- **8 đồ uống**: Cà phê đen, Cà phê sữa, Bạc xỉu, Latte, Trà sữa trân châu, Trà đào, Matcha Latte, Chocolate đá.
- **13 nguyên liệu** kèm tồn kho khởi tạo: Cà phê rang xay, Sữa đặc, Sữa tươi, Trà đen, Đào ngâm, Bột matcha, Bột cacao, Đường, Đá, Trân châu, Pudding, Kem cheese, Ly nhựa.
- **Công thức 8 món** (`recipe_ingredients`, định lượng cho size M) và **hệ số size** S/M/L = 0.8 / 1.0 / 1.25 trong bảng `recipes` → số ly bán được = `min(tồn kho / (định lượng × hệ số size + topping))`.
- **3 topping** + công thức tiêu hao: Trân châu (50 g/phần), Pudding (60 g), Kem cheese (40 g).
- **3 tài khoản**, mật khẩu chung `BrewLite123!`:
  `customer@brewlite.test` (CUSTOMER), `staff@brewlite.test` (STAFF), `admin@brewlite.test` (ADMIN).
- **2 mã khuyến mãi**: `WELCOME10` (giảm 10%, đơn từ 50.000đ, tối đa 30.000đ) và `FREESHIP` (giảm 15.000đ, đơn từ 80.000đ).
- **2 đơn mẫu** `#1001`, `#1002` kèm payment và điểm tích luỹ để xem trước trang lịch sử đơn.

Muốn xem/sửa dữ liệu trực tiếp: `cd backend && npx prisma studio` (http://localhost:5555).

> **Cảnh báo:** chỉ chạy `db:seed` trên DB trắng hoặc DB đúng bộ dữ liệu này. Trên DB đang có dữ liệu thật, seed vẫn có thể thêm user/đơn mẫu nếu chúng chưa tồn tại.

---

## 5. API chính

| Nhóm | Endpoint |
| --- | --- |
| Sản phẩm | `GET /products`, `GET /products/:id` |
| Topping | `GET /toppings` |
| Tồn kho | `GET /inventory/availability`, `GET /inventory/products/:productId/availability` (công khai) |
| Kho (STAFF/ADMIN) | `GET /inventory/ingredients`, `PATCH /inventory/ingredients/:id`, `POST /inventory/ingredients/:id/restock` |
| Xác thực | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Đơn hàng | `POST /orders` (JWT), `POST /orders/validate-promotion`, `GET /orders/me` (JWT), `GET /orders/:code`, `POST /orders/:code/cancel` (JWT) |
| Thanh toán | `POST /api/payment/create/:orderId` (hỗ trợ `Idempotency-Key`), `POST /api/payment/cancel/:orderCode` (JWT), `GET /api/payment/return` (VNPay redirect) |

Luồng đặt đơn: `POST /orders` kiểm tra và **giữ chỗ nguyên liệu trong cùng transaction** với việc tạo đơn (optimistic locking trên `ingredients.version`), nên nhiều khách đặt cùng lúc không bán vượt kho; thiếu hàng trả `409` kèm nguyên liệu còn thiếu. Đơn `PENDING` quá `ORDER_HOLD_MINUTES` (mặc định 15 phút) bị tự huỷ và trả kho.

---

## 6. Kiểm thử & build

```bash
# Backend
cd backend
npm test           # unit test (vitest)
npm run test:e2e   # e2e (cần DB sẵn sàng)
npm run lint       # oxlint --type-aware
npm run build      # nest build

# Frontend
cd frontend
npm test           # node --test lib/*.test.ts
npm run lint       # eslint
npm run build      # next build
```

---

## 7. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| `EPERM ... query_engine-windows.dll.node` khi `prisma generate` | Còn tiến trình Node đang giữ file Prisma engine. Tắt `nest start --watch` / `node dist/main` rồi chạy lại. |
| `EADDRINUSE` khi `docker compose up` | Cổng 3000/3001 đang bị dev server giữ. `docker compose down` hoặc tắt dev server. |
| `P3018 ... relation "products" already exists` khi backend khởi động | DB có schema cũ nhưng thiếu lịch sử migration. Cách sạch: `docker compose down -v` rồi `up -d --build`; hoặc baseline bằng `npx prisma migrate resolve --applied <tên-migration>`. |
| `P3008 ... already recorded as applied` | Migration đó đã có trong DB — bỏ qua, không cần chạy lại. |
| `npm error ECONNRESET` khi build Docker | Lỗi mạng khi `npm ci`; build lại (nên build tuần tự `docker compose build backend` rồi `frontend`) hoặc kiểm tra proxy/DNS của Docker Desktop. |
| Đã đổi `NEXT_PUBLIC_API_URL` nhưng frontend vẫn gọi URL cũ | Biến này nhúng lúc build: `docker compose up -d --build frontend`. |
| Quên mật khẩu tài khoản mẫu | Mật khẩu chung `BrewLite123!`, hoặc đăng ký tài khoản mới qua `/register`. |

---

## 8. Ghi chú

- `.env` **không** được commit; chỉ commit `.env.example`. Nếu file `.env` từng bị đẩy lên remote, hãy đổi `JWT_SECRET` và các khoá VNPay.
- Mọi thay đổi cấu trúc DB phải đi kèm migration mới trong `backend/prisma/migrations/`, không sửa migration đã áp dụng.
- Backend có cơ chế fallback lưu đơn ra file khi mất kết nối DB, chỉ dùng cho môi trường dev.
