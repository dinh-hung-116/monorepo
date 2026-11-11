# --- Stage 1: cài dependency + generate Prisma Client ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Copy schema trước để postinstall (prisma generate) chạy được
COPY package.json package-lock.json ./
COPY prisma ./prisma
# --legacy-peer-deps: lockfile có optional peer magicast@^0.3.5 của @prisma/config/c12
# mà npm ci strict coi là thiếu, dù npm install bỏ qua optional peer đó
RUN npm ci --legacy-peer-deps

# --- Stage 2: build TypeScript ---
FROM deps AS build
COPY . .
RUN npm run build

# --- Stage 3: runtime ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3001

# migrate deploy là idempotent: DB đã có migration thì bỏ qua
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
