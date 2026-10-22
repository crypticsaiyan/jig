import { expect, test } from "bun:test";
import { cartTotal } from "../src/cart";

const one = (price: number, qty = 1) => [{ name: "x", price, qty }];

test("half a cent rounds up", () => {
  expect(cartTotal(one(1.15), 10)).toBe("1.04");
  expect(cartTotal(one(0.15), 50)).toBe("0.08");
  expect(cartTotal(one(0.35, 2), 5)).toBe("0.67");
  expect(cartTotal(one(1.15, 3), 10)).toBe("3.11");
  expect(cartTotal(one(0.15, 3), 10)).toBe("0.41");
});

test("no float drift when adding items", () => {
  const items = [
    { name: "a", price: 0.1, qty: 1 },
    { name: "b", price: 0.2, qty: 1 },
  ];
  expect(cartTotal(items)).toBe("0.30");
  expect(cartTotal(one(4.35, 3))).toBe("13.05");
});

test("plain cases still right", () => {
  expect(cartTotal([])).toBe("0.00");
  expect(cartTotal(one(19.99, 3), 15)).toBe("50.97");
  expect(cartTotal(one(10, 2))).toBe("20.00");
});
