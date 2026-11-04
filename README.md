# monorepo
Công nghệ phần mềm assignment 1


## Sprint 1 – Task 2, 3, 4

| Mã | Việc | File |
| --- | --- | --- |
| 2.1 | Seed 8 sản phẩm mẫu (Prisma + PostgreSQL) | `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, `backend/prisma/seed.ts` |
| 2.2 | `GET /products`, `GET /products/:id` (404 khi không có, 400 khi id không phải số) | `backend/src/products/` |
| 3.2 | Lưới sản phẩm (hình, tên, giá) | `frontend/app/page.tsx` |
| 3.3 | Trạng thái loading / empty / lỗi (có nút Thử lại) | `frontend/app/page.tsx` |
| 4.1 | Trang chi tiết sản phẩm | `frontend/app/products/[id]/page.tsx` |
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
cd frontend && npm test && npm run lint && npm run build
```
