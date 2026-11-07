# monorepo
Công nghệ phần mềm assignment 1


## Sprint 1 – Task 2, 3, 4

| Mã | Việc | File |
| --- | --- | --- |
| 2.1 | Seed 8 sản phẩm mẫu (Prisma + PostgreSQL) | `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, `backend/prisma/seed.ts` |
| 2.2 | `GET /products`, `GET /products/:id` (404 khi không có, 400 khi id không phải số) | `backend/src/products/` |
| 2.3 | Kiểm thử API với database thật, phản hồi < 500ms | `backend/test/products.e2e-spec.ts` |
| 3.1 | Service gọi API: timeout 8 giây, phân biệt 404 / lỗi máy chủ / mất kết nối | `frontend/lib/api.ts` (test: `api.test.ts`) |
| 3.2 | Lưới sản phẩm (hình, tên, giá) | `frontend/app/page.tsx` |
| 3.3 | Trạng thái loading / empty / lỗi (có nút Thử lại) | `frontend/app/page.tsx` |
| 4.1 | Trang chi tiết sản phẩm | `frontend/app/products/[id]/page.tsx` |
| 4.2 | Chọn size S/M/L và topping | `frontend/components/ProductOptions.tsx`, `frontend/lib/options.ts` |
| 4.3 | Tính giá theo size + topping | `frontend/lib/pricing.ts` (test: `pricing.test.ts`) |

### Chạy thử

```bash
# 1. PostgreSQL (tạm dùng Docker; docker-compose đầy đủ thuộc Task 9.3)
docker run -d --name brewlite-db -e POSTGRES_USER=brewlite -e POSTGRES_PASSWORD=brewlite -e POSTGRES_DB=brewlite -p 5432:5432 postgres:16-alpine

# 2. Backend – http://localhost:3001/products
cd backend
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm install                   # tự chạy prisma generate
npm run db:migrate            # tạo bảng products
npm run db:seed               # thêm 8 sản phẩm mẫu
npm run start:dev

# 3. Frontend – http://localhost:3000 (mở terminal khác)
cd frontend
npm install
npm run dev
```

### Kiểm thử

```bash
cd backend  && npm test && npm run lint && npm run build
cd backend  && npm run test:e2e   # Task 2.3, cần database đã migrate + seed
cd frontend && npm test && npm run lint && npm run build
```
