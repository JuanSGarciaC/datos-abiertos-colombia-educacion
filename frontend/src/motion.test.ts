import { expect, it } from "vitest";
import { countUpValue } from "./motion";

it("countUpValue empieza en from, termina en to y frena al final", () => {
  expect(countUpValue(0, 100, 0)).toBe(0);
  expect(countUpValue(0, 100, 1)).toBe(100);
  expect(countUpValue(0, 100, 0.5)).toBeCloseTo(87.5);
  expect(countUpValue(0, 100, 5)).toBe(100);
  expect(countUpValue(200, 100, 1)).toBe(100);
});
