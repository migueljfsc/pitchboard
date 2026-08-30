import { describe, expect, it } from "vitest";

import { newSlug } from "./shares";
import { SLUG_ALPHABET, SLUG_LENGTH } from "./limits";

describe("newSlug", () => {
  it("is the right length, from the right alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const slug = newSlug();
      expect(slug).toHaveLength(SLUG_LENGTH);
      for (const ch of slug) expect(SLUG_ALPHABET).toContain(ch);
    }
  });

  // No vowels, so it cannot accidentally spell something; no look-alikes, so it survives
  // being read down a phone, which is the entire reason it exists rather than a `#d=` link.
  it("contains no vowels and no look-alike characters", () => {
    expect(SLUG_ALPHABET).not.toMatch(/[aeiou01lo]/);
  });

  /**
   * Rejection sampling, not modulo: 256 % 27 is 13, so folding a raw byte with `%` would make
   * the first thirteen letters about 10% likelier than the rest. Over a large sample the
   * counts should sit close together — this asserts the spread, which a modulo bias breaks.
   */
  it("draws from the alphabet without bias", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const ch of newSlug()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(SLUG_ALPHABET.length);

    const values = [...counts.values()];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // A modulo bias would put the low half ~10% above the high half; 25% of the mean is well
    // inside sampling noise at this sample size and well outside that.
    for (const n of values) expect(Math.abs(n - mean)).toBeLessThan(mean * 0.25);
  });
});
