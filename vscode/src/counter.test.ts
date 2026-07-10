import { test, expect } from "vitest";
import { initialState, tick, drainBatch, BATCH_SIZE } from "./counter";

test("counter accumulates focused time into impressions", () => {
  let s = initialState(0);
  for (let t = 1000; t <= 25_000; t += 1000) s = tick(s, t);
  expect(s.pending).toBe(5); // 25s / 5s
});

test("gap over idle threshold does not count", () => {
  let s = initialState(0);
  s = tick(s, 1000);
  s = tick(s, 100_000); // idle
  expect(s.accumMs).toBe(1000);
});

test("drain emits batch at threshold with monotonic seq", () => {
  let s = initialState(0);
  let t = 0;
  while (s.pending < BATCH_SIZE) { t += 1000; s = tick(s, t); }
  const first = drainBatch(s, t);
  expect(first.batch!.seq).toBe(1);
  let s2 = first.state;
  while (s2.pending < BATCH_SIZE) { t += 1000; s2 = tick(s2, t); }
  const second = drainBatch(s2, t);
  expect(second.batch!.seq).toBe(2);
});
