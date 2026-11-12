-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "size_factor_l" DECIMAL(6,3) NOT NULL DEFAULT 1.250,
ADD COLUMN     "size_factor_m" DECIMAL(6,3) NOT NULL DEFAULT 1.000,
ADD COLUMN     "size_factor_s" DECIMAL(6,3) NOT NULL DEFAULT 0.800;

-- CreateTable
CREATE TABLE "topping_ingredients" (
    "id" SERIAL NOT NULL,
    "topping_id" INTEGER NOT NULL,
    "ingredient_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "topping_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_ingredient_reservations" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "ingredient_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "consumed_at" TIMESTAMP(6),
    "released_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_ingredient_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topping_ingredients_ingredient_id_idx" ON "topping_ingredients"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "topping_ingredients_topping_id_ingredient_id_key" ON "topping_ingredients"("topping_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "order_ingredient_reservations_order_id_idx" ON "order_ingredient_reservations"("order_id");

-- CreateIndex
CREATE INDEX "order_ingredient_reservations_ingredient_id_idx" ON "order_ingredient_reservations"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "toppings_name_key" ON "toppings"("name");

-- AddForeignKey
ALTER TABLE "topping_ingredients" ADD CONSTRAINT "topping_ingredients_topping_id_fkey" FOREIGN KEY ("topping_id") REFERENCES "toppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topping_ingredients" ADD CONSTRAINT "topping_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_ingredient_reservations" ADD CONSTRAINT "order_ingredient_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_ingredient_reservations" ADD CONSTRAINT "order_ingredient_reservations_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

