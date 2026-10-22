export type Item = { name: string; price: number; qty: number }; // price in dollars, e.g. 1.15

// total after a percentage discount, as a "12.34" string
export function cartTotal(items: Item[], discountPercent = 0): string {
  let total = 0;
  for (const item of items) total += item.price * item.qty;
  total = total * (1 - discountPercent / 100);
  return total.toFixed(2);
}
