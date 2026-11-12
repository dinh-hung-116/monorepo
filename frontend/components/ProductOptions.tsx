"use client";

// Task 4.2: chọn size (S/M/L) và topping cho một món.
import { toggleTopping } from "@/lib/options";
import { formatVnd, SIZES, type Size, type ToppingId } from "@/lib/pricing";
import type { Topping } from "@/lib/types";

interface Props {
  size: Size;
  toppings: ToppingId[];
  onSizeChange: (size: Size) => void;
  onToppingsChange: (toppings: ToppingId[]) => void;
  toppingsOptions: Topping[];
}

export default function ProductOptions({
  size,
  toppings,
  onSizeChange,
  onToppingsChange,
  toppingsOptions,
}: Props) {
  return (
    <>
      <fieldset className="mt-6">
        <legend className="mb-2 font-semibold">Size</legend>
        <div role="radiogroup" aria-label="Chọn size" className="flex gap-2">
          {SIZES.map((s) => {
            const active = size === s.size;
            return (
              <button
                key={s.size}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSizeChange(s.size)}
                className={`flex-1 rounded-xl border px-3 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 ${
                  active
                    ? "border-amber-800 bg-amber-800 text-white"
                    : "border-zinc-300 hover:border-amber-800"
                }`}
              >
                {s.size}
                <span className="block text-xs font-normal">
                  {s.extra ? `+${formatVnd(s.extra)}` : "Giá gốc"}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="mb-2 font-semibold">Topping</legend>
        {toppingsOptions.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-3 py-1.5"
          >
            <input
              type="checkbox"
              checked={toppings.includes(t.id)}
              onChange={() => onToppingsChange(toggleTopping(toppings, t.id))}
              className="h-4 w-4 accent-amber-800"
            />
            <span className="flex-1">{t.name}</span>
            <span className="text-sm text-zinc-500">+{formatVnd(t.price)}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
