// sum of the whole numbers from 1 to n
export function sumTo(n: number): number {
  let total = 0;
  for (let i = 1; i < n; i++) total += i;
  return total;
}
