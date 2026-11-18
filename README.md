<div align="center">

# ☕ BrewLite

**Nền tảng đặt đồ uống không dùng tiền mặt — Cashless drink-ordering platform**

[![CI/CD](https://github.com/dinh-hung-116/monorepo/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/dinh-hung-116/monorepo/actions/workflows/ci-cd.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

</div>

BrewLite cho phép khách xem menu, chọn size/topping, đặt đơn và thanh toán online (VNPay sandbox); nhân viên quầy (barista) theo dõi hàng đợi và cập nhật trạng thái pha chế. Tồn kho nguyên liệu được **giữ chỗ theo từng đơn**, nên hệ thống không bán vượt kho.

**Tính năng chính / Key features**

- Menu, chi tiết món, chọn size (S/M/L) và topping, giỏ hàng.
- Đặt đơn có **giữ chỗ nguyên liệu** trong cùng một transaction (optimistic locking).
- Thanh toán VNPay sandbox, hỗ trợ `Idempotency-Key`.
- Mã khuyến mãi, tích điểm thành viên, huỷ đơn.
- Máy trạng thái đơn hàng (Order State Machine) và màn hình quầy pha chế cho STAFF/ADMIN.
- Tự huỷ đơn `PENDING` quá hạn và hoàn trả kho.
- Quản lý kho cho nhân viên (xem, chỉnh sửa, nhập thêm nguyên liệu).

## Mục lục / Table of Contents

1. [Tổng quan cấu trúc](#1-tổng-quan-cấu-trúc--repository-structure)
2. [Danh mục Apps & Packages](#2-danh-mục-apps--packages)
3. [Getting Started](#3-getting-started)
4. [Kiến trúc & luồng dữ liệu](#4-kiến-trúc--luồng-dữ-liệu--architecture-overview)
5. [API chính](#5-api-chính)
6. [Development Workflow](#6-development-workflow)
7. [CI/CD](#7-cicd)
8. [Xử lý sự cố](#8-xử-lý-sự-cố--troubleshooting)
9. [Lưu ý bảo mật & nợ kỹ thuật](#9-lưu-ý-bảo-mật--nợ-kỹ-thuật)

---

## 1. Tổng quan cấu trúc / Repository structure

> [!NOTE]
> Đây là monorepo **dạng thư mục thuần** (polyrepo-in-one): **không** dùng Turborepo, Nx, Lerna hay npm/Yarn/PNPM workspaces. Mỗi app có `package.json` và `package-lock.json` riêng, cài đặt và chạy độc lập. `docker-compose.yml` ở thư mục gốc là lớp điều phối chung, và GitHub Actions dùng `matrix` để chạy CI cho từng app.

```text
monorepo/
├── .github/
│   └── workflows/
│       └── ci-cd.yml            # Pipeline CI/CD (lint → test → build → docker → GHCR → rollback)
├── .postman/
│   └── resources.yaml           # Liên kết Postman workspace
├── postman/
│   └── globals/
│       └── workspace.globals.yaml
├── backend/                     # NestJS 12 REST API (cổng 3001)
│   ├── prisma/
│   │   ├── migrations/          # Lịch sử migration (không sửa migration đã áp dụng)
│   │   ├── schema.prisma        # Định nghĩa schema PostgreSQL
│   │   └── seed.ts              # Dữ liệu mẫu (idempotent)
│   ├── src/
│   │   ├── auth/                # Đăng ký/đăng nhập, JWT strategy, JwtAuthGuard, StaffGuard
│   │   ├── products/            # Menu đồ uống
│   │   ├── toppings/            # Topping
│   │   ├── inventory/           # Tồn kho, công thức, tính số ly bán được
│   │   ├── orders/              # Đơn hàng, state machine, quầy barista, tự huỷ đơn quá hạn
│   │   ├── payments/            # Tích hợp VNPay, cron hết hạn thanh toán
│   │   ├── prisma/              # PrismaService/PrismaModule
│   │   ├── app.module.ts
│   │   └── main.ts              # Bootstrap: CORS, ValidationPipe, Swagger
│   ├── test/                    # E2E test (*.e2e-spec.ts)
│   ├── Dockerfile               # Multi-stage, chạy `prisma migrate deploy` khi khởi động
│   ├── .env.example
│   ├── nest-cli.json
│   ├── vitest.config.ts
│   └── vitest.config.e2e.ts
├── frontend/                    # Next.js 16 App Router (cổng 3000)
│   ├── app/                     # Routes: /, /products/[id], /cart, /login, /register,
│   │                            #         /orders, /orders/[id], /order-confirmation, /staff
│   ├── components/              # AuthForm, CartView, Header, ProductOptions
│   ├── context/                 # AuthContext, CartContext
│   ├── lib/                     # api client, cart, options, pricing, types (+ *.test.ts)
│   ├── public/
│   ├── Dockerfile               # Multi-stage; NEXT_PUBLIC_API_URL truyền qua build arg
│   └── next.config.ts
├── docker-compose.yml           # db + backend + frontend (project: brewlite-stack)
├── .env.example                 # Biến cho Docker Compose
└── README.md
```

## 2. Danh mục Apps & Packages

| Tên gói | Đường dẫn | Vai trò / Chức năng chính | Stack | Cổng mặc định |
| --- | --- | --- | --- | --- |
| `frontend` | [`frontend/`](frontend) | Giao diện khách hàng và trang quầy pha chế `/staff` | Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript 5, Tailwind CSS 4, ESLint 9 | **3000** |
| `backend` | [`backend/`](backend) | REST API: xác thực, menu, kho, đơn hàng, thanh toán, khuyến mãi, tích điểm | NestJS 12, Prisma 6, `passport-jwt`, `class-validator`, `bcrypt`, `@nestjs/schedule`, `@nestjs/swagger`, Vitest 4, oxlint | **3001** (Swagger UI: `/api`) |
| `db` | `docker-compose.yml` | Cơ sở dữ liệu quan hệ | PostgreSQL 18 (`postgres:18-alpine`), volume `brewlite_stack_db_data` | **5434** → 5432 (host → container) |
| CI/CD | [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) | Lint, test, build, build image, publish GHCR, smoke test, rollback | GitHub Actions, GHCR | — |
| Postman | [`postman/`](postman), [`.postman/`](.postman) | Cấu hình Postman workspace dùng chung | Postman | — |

Mô hình dữ liệu (Prisma): `users`, `products`, `toppings`, `recipes`, `ingredients`, `recipe_ingredients`, `topping_ingredients`, `orders`, `order_items`, `order_item_toppings`, `order_ingredient_reservations`, `payments`, `promotions`, `loyaltytransactions`. Vai trò người dùng: `CUSTOMER`, `STAFF`, `ADMIN`.

## 3. Getting Started

### 3.1. Yêu cầu môi trường / Prerequisites

| Công cụ | Phiên bản khuyến nghị | Ghi chú |
| --- | --- | --- |
| Node.js | **22 LTS** | Khớp `node:22-bookworm-slim` trong Dockerfile và CI |
| npm | đi kèm Node 22 | Repo dùng `package-lock.json` |
| Docker + Docker Compose v2 | bản mới | Bắt buộc nếu chạy bằng container; nếu chạy local, vẫn nên dùng Docker để dựng riêng DB |
| PostgreSQL | **18** (tối thiểu 16+) | Chỉ cần cài nếu không dùng Docker cho DB |

### 3.2. Biến môi trường / Environment variables

Có **ba** nơi cấu hình, mỗi nơi phục vụ một mục đích:

| File | Dùng bởi | Tạo từ |
| --- | --- | --- |
| `./.env` | `docker compose` (tên image, tài khoản Postgres, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`) | `.env.example` |
| `./backend/.env` | Backend (cả khi chạy local lẫn qua `env_file` của Compose) | `backend/.env.example` |
| `./frontend/.env.local` | Frontend khi chạy `npm run dev` | tạo tay (tuỳ chọn) |

```bash
cp .env.example .env
cp backend/.env.example backend/.env      # PowerShell: Copy-Item backend/.env.example backend/.env
```

> [!WARNING]
> `docker compose` **bắt buộc** có `./backend/.env` (khai báo `env_file`) và có `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `IMAGE_TAG` trong `./.env` (dùng để đặt tên image). Thiếu một trong hai, Compose sẽ báo lỗi.

**Backend (`backend/.env`)**

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
| --- | :---: | --- | --- |
| `DATABASE_URL` | ✅ | `postgresql://brewlite:brewlite@localhost:5432/brewlite` | Chuỗi kết nối PostgreSQL. Compose tự ghi đè thành `db:5432` |
| `PORT` | | `3001` | Cổng API |
| `JWT_SECRET` | ✅ | — | Khoá ký JWT. **Phải đổi** ở mọi môi trường dùng chung |
| `CORS_ORIGIN` | | `http://localhost:3000` | Origin của frontend được phép gọi API |
| `FRONTEND_URL` | | `CORS_ORIGIN` | URL frontend để redirect về sau khi VNPay trả kết quả |
| `VNPAY_TMN_CODE` | ✅ (khi thanh toán) | — | Mã website VNPay sandbox |
| `VNPAY_HASH_SECRET` | ✅ (khi thanh toán) | — | Khoá ký/kiểm tra chữ ký VNPay |
| `VNPAY_PAYMENT_URL` | ✅ (khi thanh toán) | — | Mặc định sandbox: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` |
| `ORDER_HOLD_MINUTES` | | `15` | Số phút giữ chỗ đơn `PENDING` trước khi tự huỷ |
| `ORDER_EXPIRY_INTERVAL_MS` | | `60000` | Chu kỳ quét đơn quá hạn (tối thiểu 1000) |

**Docker Compose (`./.env`)**

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `brewlite` / `brewlite` / `brewlite_db` | Tài khoản và tên DB của container Postgres |
| `JWT_SECRET` | `brewlite_super_secret_jwt_key_2026` | Truyền vào backend container |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | URL API mà trình duyệt gọi tới |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `IMAGE_TAG` | `brewlite-stack-backend`, `brewlite-stack-frontend`, `latest` | Tên và tag image |

> [!IMPORTANT]
> `NEXT_PUBLIC_API_URL` được **nhúng vào JS lúc build**. Đổi giá trị này thì phải build lại frontend (`docker compose up -d --build frontend`).

### 3.3. Cách A — Chạy toàn bộ bằng Docker (khuyến nghị)

```bash
cp .env.example .env
cp backend/.env.example backend/.env     # rồi sửa các giá trị VNPAY_*, JWT_SECRET

docker compose up -d --build             # build và chạy db + backend + frontend
docker compose run --rm backend npm run db:seed   # (tuỳ chọn) nạp dữ liệu mẫu
docker compose ps
```

| Service | Địa chỉ | Ghi chú |
| --- | --- | --- |
| Frontend | http://localhost:3000 | Chạy production (`next start`) |
| Backend | http://localhost:3001 | Tự chạy `prisma migrate deploy` khi khởi động. Health check: `/health` |
| Swagger UI | http://localhost:3001/api | Tài liệu API tương tác |
| PostgreSQL | `localhost:5434` | `brewlite` / `brewlite` / `brewlite_db` (mặc định) |

Các lệnh Docker thường dùng:

```bash
docker compose logs -f backend                         # xem log
docker compose up -d --build backend                   # build lại riêng backend
docker compose up -d --build frontend                  # build lại riêng frontend
docker compose exec db psql -U brewlite -d brewlite_db # vào psql
docker compose down                                    # dừng, giữ dữ liệu
docker compose down -v                                 # dừng và XOÁ volume (mất dữ liệu)
```

> [!CAUTION]
> `docker compose down -v` xoá volume `brewlite_stack_db_data` và toàn bộ dữ liệu DB.

> [!NOTE]
> Container chiếm cổng 3000/3001. Hãy tắt dev server local trước khi `docker compose up`, và ngược lại.

### 3.4. Cách B — Chạy dev local (hot reload)

**Bước 1. Dựng PostgreSQL** (chọn một):

```bash
# Dùng Docker chỉ cho DB (khớp với DATABASE_URL trong backend/.env.example)
docker run -d --name brewlite-db \
  -e POSTGRES_USER=brewlite -e POSTGRES_PASSWORD=brewlite -e POSTGRES_DB=brewlite \
  -p 5432:5432 postgres:18-alpine
```

Hoặc dùng PostgreSQL cài sẵn và chỉnh `DATABASE_URL` cho đúng máy.

**Bước 2. Backend** (cổng 3001):

```bash
cd backend
cp .env.example .env         # rồi chỉnh DATABASE_URL, JWT_SECRET, VNPAY_*
npm ci                       # postinstall tự chạy `prisma generate`
npm run db:migrate           # prisma migrate deploy: tạo toàn bộ bảng
npm run db:seed              # (tuỳ chọn) nạp dữ liệu mẫu
npm run start:dev            # nest start --watch
```

> [!NOTE]
> Trong Docker, backend dùng `npm ci --legacy-peer-deps` (xem chú thích trong `backend/Dockerfile`). Nếu `npm ci` local báo lỗi peer dependency, thêm cờ này.

**Bước 3. Frontend** (cổng 3000):

```bash
cd frontend
npm ci
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local   # chỉ cần nếu API không ở cổng mặc định
npm run dev
```

Mở http://localhost:3000.

### 3.5. Dữ liệu mẫu / Seed data

Nguồn duy nhất: [`backend/prisma/seed.ts`](backend/prisma/seed.ts) (`npm run db:seed` → `tsx prisma/seed.ts`). Seed dùng `upsert`, chạy lại nhiều lần không tạo bản ghi trùng và không ghi đè tồn kho hiện có.

| Nhóm | Nội dung |
| --- | --- |
| Đồ uống | 8 món (Cà phê đen, Cà phê sữa, Bạc xỉu, Latte, Trà sữa trân châu, Trà đào, Matcha Latte, Chocolate đá) |
| Nguyên liệu + công thức | 13 nguyên liệu kèm tồn kho; công thức định lượng theo size M, hệ số size S/M/L = 0.8 / 1.0 / 1.25 |
| Topping | Trân châu, Pudding, Kem cheese (kèm công thức tiêu hao) |
| Tài khoản | `customer@brewlite.test` (CUSTOMER), `staff@brewlite.test` (STAFF), `admin@brewlite.test` (ADMIN), mật khẩu chung `BrewLite123!` |
| Khuyến mãi | `WELCOME10` (giảm 10%, đơn ≥ 50.000đ, tối đa 30.000đ), `FREESHIP` (giảm 15.000đ, đơn ≥ 80.000đ) |
| Đơn mẫu | `#1001`, `#1002` kèm payment và điểm tích luỹ |

> [!WARNING]
> Các tài khoản mẫu dùng mật khẩu công khai. **Không chạy seed trên môi trường production.**

Xem dữ liệu trực quan: `cd backend && npx prisma studio` (http://localhost:5555).

## 4. Kiến trúc & luồng dữ liệu / Architecture Overview

```mermaid
flowchart LR
    U["Trình duyệt<br/>(Khách / Barista)"] -->|"HTTP :3000"| FE["Frontend<br/>Next.js 16"]
    U -->|"REST + JWT :3001"| BE
    FE -. "fetch API (NEXT_PUBLIC_API_URL)" .-> BE["Backend<br/>NestJS 12"]
    BE -->|"Prisma 6"| DB[("PostgreSQL 18")]
    BE <-->|"Tạo URL / Return URL"| VNP["VNPay Sandbox"]
    U -->|"Chuyển hướng thanh toán"| VNP
    BE -->|"Cron / setInterval: huỷ đơn quá hạn"| BE
```

**Các module backend** (`backend/src/app.module.ts`): `Prisma`, `Products`, `Toppings`, `Auth`, `Inventory`, `Orders`, `Payments`, `Schedule`.

**Luồng đặt hàng và thanh toán**

```mermaid
sequenceDiagram
    actor C as Khách
    participant FE as Frontend
    participant BE as Backend
    participant DB as PostgreSQL
    participant V as VNPay

    C->>FE: Chọn món, size, topping, mã khuyến mãi
    FE->>BE: POST /orders (JWT)
    BE->>DB: Transaction: tạo đơn + giữ chỗ nguyên liệu (optimistic lock)
    alt Thiếu nguyên liệu
        BE-->>FE: 409 + danh sách nguyên liệu thiếu
    else Đủ hàng
        BE-->>FE: Đơn PENDING
        FE->>BE: POST /api/payment/create/:orderId (Idempotency-Key)
        BE-->>FE: paymentUrl
        FE->>V: Redirect sang VNPay
        V->>BE: GET /api/payment/return (kèm chữ ký)
        BE->>DB: Xác thực chữ ký, đơn → PAID, trừ kho, cộng điểm
        BE-->>C: Redirect /order-confirmation
    end
```

**Máy trạng thái đơn hàng** ([`order-state.ts`](backend/src/orders/order-state.ts)). Mọi thay đổi trạng thái phải đi qua bảng chuyển tiếp này, chuyển tiếp ngoài bảng bị chặn với `409 Conflict`.

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PAID: Thanh toán OK
    PENDING --> PAYMENT_FAILED: Thanh toán lỗi
    PENDING --> CANCELLED: Huỷ / quá hạn
    PAYMENT_FAILED --> PENDING: Thử lại
    PAYMENT_FAILED --> CANCELLED
    PAID --> PREPARING: Barista nhận
    PAID --> CANCELLED
    PREPARING --> READY: Pha xong
    READY --> COMPLETED: Giao khách
    COMPLETED --> [*]
    CANCELLED --> [*]
```

**Các quy tắc nghiệp vụ quan trọng**

- **Giữ chỗ kho:** khi tạo đơn, `ingredients.reserved` tăng trong cùng transaction với việc tạo đơn. Khi thanh toán xong thì `quantity` bị trừ; khi lỗi hoặc huỷ thì `reserved` được trả lại. Cơ chế dùng `ingredients.version` (optimistic locking) và `order_ingredient_reservations.consumed_at/released_at` để chạy lặp vẫn đúng (idempotent).
- **Số ly bán được** = `min(tồn kho / (định lượng × hệ số size + định lượng topping))`.
- **Tự huỷ đơn quá hạn:** đơn `PENDING` quá `ORDER_HOLD_MINUTES` bị huỷ và trả kho. Hai cơ chế cùng tồn tại trong mã: `OrderExpiryService` (`setInterval`, tắt khi chạy test) và `PaymentsSchedulerService` (cron mỗi phút, chuyển payment `PENDING` quá hạn sang `FAILED`).
- **Phân quyền:** `JwtAuthGuard` xác thực JWT, `StaffGuard` giới hạn route cho `STAFF`/`ADMIN`.

## 5. API chính

Swagger UI: http://localhost:3001/api. Bảng dưới liệt kê các route theo mã nguồn controller.

| Nhóm | Endpoint | Quyền |
| --- | --- | --- |
| Hệ thống | `GET /` · `GET /health` | Công khai |
| Sản phẩm | `GET /products` · `GET /products/:id` | Công khai |
| Topping | `GET /toppings` | Công khai |
| Tồn kho | `GET /inventory/availability` · `GET /inventory/products/:productId/availability` | Công khai |
| Kho (nhân viên) | `GET /inventory/ingredients` · `PATCH /inventory/ingredients/:id` · `POST /inventory/ingredients/:id/restock` | STAFF/ADMIN |
| Xác thực | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` | `me` cần JWT |
| Đơn hàng | `POST /orders` · `GET /orders/me` · `GET /orders/:code` · `POST /orders/:code/cancel` | JWT |
| Khuyến mãi | `POST /orders/validate-promotion` | Công khai |
| Quầy barista | `GET /staff/orders` · `PATCH /orders/:code/status` | STAFF/ADMIN |
| Thanh toán | `POST /api/payment/create/:orderId` (hỗ trợ header `Idempotency-Key`) | JWT |
| Thanh toán | `GET /api/payment/return` (VNPay redirect về) | Công khai (xác thực bằng chữ ký VNPay) |

## 6. Development Workflow

### 6.1. Scripts thường dùng

Chạy từ thư mục của từng app (không có script gộp ở thư mục gốc).

| Tác vụ | `backend/` | `frontend/` |
| --- | --- | --- |
| Dev (watch) | `npm run start:dev` | `npm run dev` |
| Lint | `npm run lint` (oxlint `--type-aware`) | `npm run lint` (ESLint) |
| Format | `npm run format` (Prettier) | — |
| Unit test | `npm test` (Vitest) | `npm test` (`node --test lib/*.test.ts`) |
| Test watch | `npm run test:watch` | — |
| Coverage | `npm run test:cov` | — |
| E2E test | `npm run test:e2e` (cần DB sẵn sàng) | — |
| Build | `npm run build` (`nest build`) | `npm run build` (`next build`) |
| Chạy production | `npm run start:prod` | `npm start` |
| Debug | `npm run test:debug` · `npm run start:debug` | — |
| Migration (deploy) | `npm run db:migrate` | — |
| Seed | `npm run db:seed` | — |

**Làm việc với schema Prisma**

```bash
cd backend
npx prisma migrate dev --name ten_thay_doi   # sau khi sửa prisma/schema.prisma
npx prisma generate                          # sinh lại Prisma Client
```

> [!IMPORTANT]
> Mọi thay đổi cấu trúc DB phải đi kèm **migration mới** trong `backend/prisma/migrations/`. Không sửa migration đã áp dụng.

### 6.2. Quy trình branch / PR

1. Cập nhật `main`, rồi tạo branch ngắn hạn từ `main`. Lịch sử repo đang dùng các tiền tố: `feat/<mô-tả>`, `patch/<mô-tả>`, `quick-patch/<mô-tả>`, `CI/CD-patch-<n>`.
2. Commit nhỏ, tập trung, theo quy ước bên dưới.
3. Trước khi push, chạy `lint`, `test`, `build` cho app bạn đã sửa (CI sẽ chạy lại các bước này).
4. Mở Pull Request vào `main`. CI phải xanh trước khi merge. Mô tả PR nêu rõ: mục tiêu, thay đổi chính, cách kiểm thử, và migration (nếu có).
5. Không commit trực tiếp lên `main`, không force-push `main`.

### 6.3. Quy ước commit

Dùng [Conventional Commits](https://www.conventionalcommits.org/) (phù hợp với lịch sử commit hiện tại):

```text
<type>(<scope>): <mô tả ngắn, thể mệnh lệnh>
```

| `type` | Dùng khi |
| --- | --- |
| `feat` | Thêm tính năng |
| `fix` | Sửa lỗi |
| `refactor` | Tái cấu trúc, không đổi hành vi |
| `test` | Thêm/sửa test |
| `docs` | Tài liệu |
| `chore` / `ci` / `build` | Công cụ, CI, build, dependency |

Ví dụ: `feat(orders): máy trạng thái đơn hàng và quầy pha chế cho barista`, `fix(payments): cập nhật promotion_usage sau thanh toán`.

## 7. CI/CD

Workflow [`ci-cd.yml`](.github/workflows/ci-cd.yml) chạy khi `push` hoặc `pull_request` vào `main`:

```mermaid
flowchart LR
    Q["quality<br/>(matrix: backend, frontend)<br/>npm ci → lint → test → build"] --> D["docker<br/>build 2 image + lưu artifact"]
    D --> I["integration<br/>docker compose + migrate + smoke test"]
    I -->|"chỉ khi push"| P["publish<br/>push GHCR theo SHA"]
    P --> V["verify-ghcr<br/>pull image + smoke test<br/>→ gắn tag latest, lưu LAST_GOOD_SHA"]
    V -->|"thất bại"| R["rollback<br/>trả tag latest về LAST_GOOD_SHA"]
```

- Image được publish tại `ghcr.io/<owner>/<repo>-backend` và `ghcr.io/<owner>/<repo>-frontend`, gắn tag theo commit SHA; `latest` chỉ được cập nhật sau khi smoke test GHCR đạt.
- Smoke test gọi `GET http://localhost:3001/health` và `GET http://localhost:3000/`.
- Cần secret `REPO_VARS_TOKEN` để job `verify-ghcr` ghi biến repo `LAST_GOOD_SHA` (dùng cho rollback).

## 8. Xử lý sự cố / Troubleshooting

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| `docker compose` báo lỗi *invalid reference format* hoặc không tìm thấy `backend/.env` | Thiếu `./.env` (cần `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `IMAGE_TAG`) hoặc `./backend/.env`. Xem [mục 3.2](#32-biến-môi-trường--environment-variables). |
| `EPERM ... query_engine-windows.dll.node` khi `prisma generate` | Còn tiến trình Node giữ file Prisma engine. Tắt `nest start --watch` / `node dist/main` rồi chạy lại. |
| `EADDRINUSE` khi `docker compose up` | Cổng 3000/3001 đang bị dev server giữ. Chạy `docker compose down` hoặc tắt dev server. |
| `P3018 ... relation "products" already exists` | DB có schema cũ nhưng thiếu lịch sử migration. Cách sạch: `docker compose down -v` rồi `up -d --build`; hoặc baseline bằng `npx prisma migrate resolve --applied <tên-migration>`. |
| `P3008 ... already recorded as applied` | Migration đã có trong DB, bỏ qua. |
| `npm error ECONNRESET` khi build Docker | Lỗi mạng khi `npm ci`. Build lại tuần tự (`docker compose build backend` rồi `frontend`) hoặc kiểm tra proxy/DNS của Docker Desktop. |
| Đổi `NEXT_PUBLIC_API_URL` mà frontend vẫn gọi URL cũ | Biến được nhúng lúc build: `docker compose up -d --build frontend`. |
| Thanh toán trả `VNPay configuration is missing` (503) | Chưa đặt `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL` trong `backend/.env`. |
| Redirect sau thanh toán về sai địa chỉ | Đặt `FRONTEND_URL` (hoặc `CORS_ORIGIN`) trong `backend/.env` đúng với địa chỉ frontend. |
| Không đăng nhập được tài khoản mẫu | Mật khẩu chung `BrewLite123!`, hoặc đăng ký mới tại `/register`. Cần đã chạy `npm run db:seed`. |

## 9. Lưu ý bảo mật & nợ kỹ thuật

> [!CAUTION]
> **Cần xử lý trước khi triển khai thật:**
> - File **`.env` ở thư mục gốc đang được Git theo dõi** (`git ls-files .env` có kết quả), dù `.gitignore` đã khai báo. Hãy chạy `git rm --cached .env`, xoay (rotate) mọi bí mật đã nằm trong lịch sử commit, và chỉ commit `.env.example`.
> - [`backend/.env.example`](backend/.env.example) hiện chứa **giá trị trông như thông tin thật** (mật khẩu DB và khoá VNPay sandbox). Template nên chỉ chứa giá trị giả (placeholder); hãy thay bằng placeholder và xoay các khoá đó.
> - `JWT_SECRET` mặc định (`brewlite_super_secret_jwt_key_2026`) là công khai. Luôn đặt giá trị ngẫu nhiên, dài, riêng cho mỗi môi trường.

**Nợ kỹ thuật đã ghi nhận**

- `backend/src/main.ts`: cấu hình Swagger còn là placeholder (`Cats example`, tag `cats`), cần đổi thành thông tin BrewLite.
- `PrismaService` còn logic cũ tự tạo bảng bằng SQL thô (`ensureSchema`) và đồng bộ dữ liệu dự phòng từ `.data/*.json` khi DB mất kết nối. Schema thật do Prisma migration quản lý; logic này chỉ nên dùng cho dev và nên được loại bỏ dần.
- `docker-compose.yml` cố định `CORS_ORIGIN=http://localhost:3000` cho backend; cần tham số hoá khi triển khai ra domain thật.
- Có hai cơ chế tự huỷ/hết hạn chạy song song (xem [mục 4](#4-kiến-trúc--luồng-dữ-liệu--architecture-overview)); nên hợp nhất để tránh chồng chéo.
- Chưa có file `LICENSE`; package đang đặt `private`/`UNLICENSED`.
- Chưa có script gộp ở thư mục gốc (lint/test/build toàn bộ); có thể bổ sung bằng npm workspaces hoặc Turborepo khi repo lớn hơn.

---

<div align="center">

[github.com/dinh-hung-116/monorepo](https://github.com/dinh-hung-116/monorepo)

</div>
