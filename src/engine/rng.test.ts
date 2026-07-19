import { describe, expect, it } from 'vitest';
import { createRng, shuffled } from './rng';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces the canonical mulberry32 sequence', () => {
    const rng = createRng(42);
    expect(rng()).toBe(0.60110375192016363);
    expect(rng()).toBe(0.44829055899754167);
    expect(rng()).toBe(0.85246579349040985);
    expect(createRng(1)()).toBe(0.62707394058816135);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('handles negative and fractional seeds deterministically', () => {
    const a = createRng(-7.9);
    const b = createRng(-7.9);
    expect(Array.from({ length: 5 }, () => a())).toEqual(Array.from({ length: 5 }, () => b()));
  });
});

describe('shuffled', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('preserves the multiset of items', () => {
    const result = shuffled(items, createRng(7));
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it('returns a new array without mutating the input', () => {
    const snapshot = [...items];
    const result = shuffled(items, createRng(7));
    expect(result).not.toBe(items);
    expect(items).toEqual(snapshot);
  });

  it('is deterministic under a seeded rng', () => {
    expect(shuffled(items, createRng(99))).toEqual(shuffled(items, createRng(99)));
  });

  it('varies with the seed', () => {
    const outputs = new Set(
      [1, 2, 3, 4, 5].map((seed) => shuffled(items, createRng(seed)).join(',')),
    );
    expect(outputs.size).toBeGreaterThan(1);
  });

  it('handles empty and singleton arrays', () => {
    expect(shuffled([], createRng(1))).toEqual([]);
    expect(shuffled(['x'], createRng(1))).toEqual(['x']);
  });
});
