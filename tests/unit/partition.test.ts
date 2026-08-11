import { describe, expect, test } from "bun:test";
import { partitionTrailingRemainder } from "../../src/grid/partition";

describe("partitionTrailingRemainder", () => {
  test("splits 43 items into 40 complete and 3 trailing for four columns", () => {
    const items = Array.from({ length: 43 }, (_, i) => i);
    const result = partitionTrailingRemainder(items, 4);
    expect(result.complete).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(result.remainder).toEqual([40, 41, 42]);
  });

  test("keeps an exactly divisible collection whole", () => {
    expect(partitionTrailingRemainder([1, 2, 3, 4], 2)).toEqual({
      complete: [1, 2, 3, 4],
      remainder: [],
    });
  });

  test("leaves a collection smaller than one row entirely separate", () => {
    expect(partitionTrailingRemainder([1, 2, 3], 4)).toEqual({
      complete: [],
      remainder: [1, 2, 3],
    });
  });
});
