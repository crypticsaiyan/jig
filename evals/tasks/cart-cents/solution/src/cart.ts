export type Item = { name: string; price: number; qty: number }; // price in dollars, e.g. 1.15

// total after a percentage discount, as a "12.34" string
export function cartTotal(items: Item[], discountPercent = 0): string {
  // whole cents times whole percent: never a fraction until the final rounding
  let cents = 0;
  for (const item of items) cents += Math.round(item.price * 100) * item.qty;
  const scaled = cents * (100 - discountPercent); // hundredths of a cent
  const rounded = Math.floor((scaled + 50) / 100); // half a cent rounds up
  return (rounded / 100).toFixed(2);
}
