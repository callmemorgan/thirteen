import { describe, expect, it } from 'vitest';
import type { Card, Combo, ComboType, Rank, Suit } from './types';
import { beats, classifyCombo, comboLabel } from './combos';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });
const s = (rank: Rank) => card(rank, 'spades');
const c = (rank: Rank) => card(rank, 'clubs');
const d = (rank: Rank) => card(rank, 'diamonds');
const h = (rank: Rank) => card(rank, 'hearts');

function comboOf(cards: Card[]): Combo {
  const combo = classifyCombo(cards);
  if (combo === null) throw new Error('test setup error: cards do not form a legal combo');
  return combo;
}

describe('classifyCombo: legal combos', () => {
  it('classifies a single', () => {
    const combo = comboOf([h(7)]);
    expect(combo.type).toBe('single');
    expect(combo.length).toBe(1);
    expect(combo.top).toEqual(h(7));
  });

  it('classifies a pair, with the top card decided by suit', () => {
    const combo = comboOf([s(9), h(9)]);
    expect(combo.type).toBe('pair');
    expect(combo.length).toBe(2);
    expect(combo.top).toEqual(h(9));
  });

  it('classifies a triple', () => {
    const combo = comboOf([s(5), d(5), h(5)]);
    expect(combo.type).toBe('triple');
    expect(combo.length).toBe(3);
    expect(combo.top).toEqual(h(5));
  });

  it('classifies a quad', () => {
    const combo = comboOf([s(12), c(12), d(12), h(12)]);
    expect(combo.type).toBe('quad');
    expect(combo.length).toBe(4);
    expect(combo.top).toEqual(h(12));
  });

  it('classifies a 3-card straight', () => {
    const combo = comboOf([d(5), s(3), h(4)]);
    expect(combo.type).toBe('straight');
    expect(combo.length).toBe(3);
    expect(combo.top).toEqual(d(5));
    expect(combo.cards).toEqual([s(3), h(4), d(5)]);
  });

  it('classifies a 5-card straight with mixed suits', () => {
    const combo = comboOf([h(9), s(10), d(11), c(12), h(13)]);
    expect(combo.type).toBe('straight');
    expect(combo.length).toBe(5);
    expect(combo.top).toEqual(h(13));
  });

  it('classifies a straight running up to the ace (no 2)', () => {
    const combo = comboOf([s(10), c(11), d(12), h(13), s(14)]);
    expect(combo.type).toBe('straight');
    expect(combo.top).toEqual(s(14));
  });

  it('classifies the 12-card straight 3..A', () => {
    const combo = comboOf([
      s(3),
      c(4),
      d(5),
      h(6),
      s(7),
      c(8),
      d(9),
      h(10),
      s(11),
      c(12),
      d(13),
      h(14),
    ]);
    expect(combo.type).toBe('straight');
    expect(combo.length).toBe(12);
    expect(combo.top).toEqual(h(14));
  });

  it('classifies a 3-pair run and returns cards sorted ascending', () => {
    const combo = comboOf([h(5), s(3), c(4), h(3), d(4), s(5)]);
    expect(combo.type).toBe('pair-run');
    expect(combo.length).toBe(6);
    expect(combo.cards).toEqual([s(3), h(3), c(4), d(4), s(5), h(5)]);
    expect(combo.top).toEqual(h(5));
  });

  it('classifies a 4-pair run', () => {
    const combo = comboOf([s(8), h(8), c(9), d(9), s(10), h(10), c(11), d(11)]);
    expect(combo.type).toBe('pair-run');
    expect(combo.length).toBe(8);
    expect(combo.top).toEqual(d(11));
  });

  it('classifies a 5-pair run', () => {
    const combo = comboOf([
      s(3),
      h(3),
      c(4),
      d(4),
      s(5),
      h(5),
      c(6),
      d(6),
      s(7),
      h(7),
    ]);
    expect(combo.type).toBe('pair-run');
    expect(combo.length).toBe(10);
    expect(combo.top).toEqual(h(7));
  });
});

describe('classifyCombo: illegal combos', () => {
  it('rejects the empty set', () => {
    expect(classifyCombo([])).toBeNull();
  });

  it('rejects two cards of different ranks', () => {
    expect(classifyCombo([s(3), h(4)])).toBeNull();
  });

  it('rejects five cards of the same rank', () => {
    expect(classifyCombo([s(9), c(9), d(9), h(9), s(9)])).toBeNull();
  });

  it('rejects mixed-rank groups', () => {
    expect(classifyCombo([s(7), d(7), h(8)])).toBeNull();
    expect(classifyCombo([s(7), d(7), h(7), c(8)])).toBeNull();
  });

  it('rejects non-consecutive straights', () => {
    expect(classifyCombo([s(3), d(4), h(6)])).toBeNull();
    expect(classifyCombo([s(3), c(4), d(5), h(7)])).toBeNull();
  });

  it('rejects a straight attempt with a duplicated rank', () => {
    expect(classifyCombo([s(3), h(3), d(4)])).toBeNull();
  });

  it('rejects straights containing a 2', () => {
    expect(classifyCombo([c(13), d(14), s(15)])).toBeNull();
    expect(classifyCombo([s(10), c(11), d(12), h(13), s(14), h(15)])).toBeNull();
  });

  it('rejects a run of only two pairs', () => {
    expect(classifyCombo([s(3), h(3), c(4), d(4)])).toBeNull();
  });

  it('rejects non-consecutive pair-runs', () => {
    expect(classifyCombo([s(3), h(3), c(4), d(4), s(6), h(6)])).toBeNull();
  });

  it('rejects pair-runs with uneven groups', () => {
    expect(classifyCombo([s(3), c(3), h(3), s(4), c(4), h(4)])).toBeNull();
  });

  it('rejects pair-runs containing a 2', () => {
    expect(classifyCombo([s(13), h(13), c(14), d(14), s(15), h(15)])).toBeNull();
  });
});

describe('beats: same type, same length', () => {
  it('compares singles by rank, then suit', () => {
    expect(beats(comboOf([h(7)]), comboOf([d(7)]))).toBe(true);
    expect(beats(comboOf([d(7)]), comboOf([h(7)]))).toBe(false);
    expect(beats(comboOf([s(15)]), comboOf([h(14)]))).toBe(true);
    expect(beats(comboOf([h(14)]), comboOf([s(15)]))).toBe(false);
  });

  it('does not beat an identical single', () => {
    expect(beats(comboOf([h(7)]), comboOf([h(7)]))).toBe(false);
  });

  it('compares pairs by rank, then the suit of the top card', () => {
    expect(beats(comboOf([s(8), h(8)]), comboOf([s(7), h(7)]))).toBe(true);
    expect(beats(comboOf([s(7), h(7)]), comboOf([s(8), h(8)]))).toBe(false);
    // Pair of Ks topped by K♥ beats a pair of Ks topped only by K♦.
    expect(beats(comboOf([d(13), h(13)]), comboOf([s(13), d(13)]))).toBe(true);
    expect(beats(comboOf([s(13), d(13)]), comboOf([d(13), h(13)]))).toBe(false);
  });

  it('lets a pair of 2s beat any other pair', () => {
    expect(beats(comboOf([s(15), c(15)]), comboOf([d(14), h(14)]))).toBe(true);
  });

  it('compares triples by rank, then the suit of the top card', () => {
    expect(beats(comboOf([s(9), c(9), h(9)]), comboOf([s(8), c(8), h(8)]))).toBe(true);
    expect(beats(comboOf([s(9), c(9), h(9)]), comboOf([s(9), c(9), d(9)]))).toBe(true);
    expect(beats(comboOf([s(9), c(9), d(9)]), comboOf([s(9), c(9), h(9)]))).toBe(false);
  });

  it('compares quads by rank (suits always coincide)', () => {
    expect(beats(comboOf([s(10), c(10), d(10), h(10)]), comboOf([s(9), c(9), d(9), h(9)]))).toBe(
      true,
    );
    expect(beats(comboOf([s(9), c(9), d(9), h(9)]), comboOf([s(10), c(10), d(10), h(10)]))).toBe(
      false,
    );
  });

  it('compares equal-length straights by top card', () => {
    expect(beats(comboOf([s(4), c(5), d(6)]), comboOf([s(3), c(4), d(5)]))).toBe(true);
    expect(beats(comboOf([s(3), c(4), d(5)]), comboOf([s(4), c(5), d(6)]))).toBe(false);
    // Same ranks, top card suit decides.
    expect(beats(comboOf([s(4), c(5), h(6)]), comboOf([s(4), c(5), d(6)]))).toBe(true);
  });

  it('compares equal-length pair-runs by top card', () => {
    const low = comboOf([s(3), h(3), c(4), d(4), s(5), h(5)]);
    const high = comboOf([s(4), h(4), c(5), d(5), c(6), d(6)]);
    expect(beats(high, low)).toBe(true);
    expect(beats(low, high)).toBe(false);
    // Same ranks: the run topped by 6♥ beats the one topped by 6♦.
    const highHearts = comboOf([s(4), h(4), c(5), d(5), s(6), h(6)]);
    expect(beats(highHearts, high)).toBe(true);
  });

  it('never lets straights of different lengths compete', () => {
    const three = comboOf([s(12), c(13), d(14)]);
    const four = comboOf([s(3), c(4), d(5), h(6)]);
    expect(beats(three, four)).toBe(false);
    expect(beats(four, three)).toBe(false);
  });

  it('never lets pair-runs of different lengths compete (except documented chops)', () => {
    const threePair = comboOf([s(3), h(3), c(4), d(4), s(5), h(5)]);
    const fivePair = comboOf([s(3), h(3), c(4), d(4), s(5), h(5), c(6), d(6), s(7), h(7)]);
    expect(beats(fivePair, threePair)).toBe(false);
    expect(beats(threePair, fivePair)).toBe(false);
  });
});

describe('beats: cross-type without chops', () => {
  const samples: Record<ComboType, Combo> = {
    single: comboOf([h(7)]),
    pair: comboOf([s(7), h(7)]),
    triple: comboOf([s(7), c(7), d(7)]),
    quad: comboOf([s(7), c(7), d(7), h(7)]),
    straight: comboOf([s(7), c(8), d(9)]),
    'pair-run': comboOf([s(7), h(7), s(8), h(8), s(9), h(9)]),
  };
  const types = Object.keys(samples) as ComboType[];

  it('no type beats a different type when no 2s are involved', () => {
    for (const challenger of types) {
      for (const target of types) {
        if (challenger === target) continue;
        expect(
          beats(samples[challenger], samples[target]),
          `${challenger} vs ${target}`,
        ).toBe(false);
      }
    }
  });
});

describe('beats: chop matrix', () => {
  const singleTwo = comboOf([d(15)]);
  const pairOfTwos = comboOf([s(15), h(15)]);
  const quad = comboOf([s(9), c(9), d(9), h(9)]);
  const quadOfAces = comboOf([s(14), c(14), d(14), h(14)]);
  const quadOfTwos = comboOf([s(15), c(15), d(15), h(15)]);
  const threePairRun = comboOf([s(10), h(10), c(11), h(11), d(12), h(12)]);
  // Deliberately low ranks: chops ignore the ranks of the run.
  const fourPairRun = comboOf([s(3), h(3), c(4), h(4), d(5), h(5), s(6), h(6)]);
  const fivePairRun = comboOf([s(3), h(3), c(4), d(4), s(5), h(5), c(6), d(6), s(7), h(7)]);
  const singleAce = comboOf([h(14)]);

  it('a quad beats a single 2', () => {
    expect(beats(quad, singleTwo)).toBe(true);
    expect(beats(quad, comboOf([s(15)]))).toBe(true);
  });

  it('a quad does NOT beat a pair of 2s', () => {
    expect(beats(quad, pairOfTwos)).toBe(false);
  });

  it('a quad does NOT beat a non-2 single', () => {
    expect(beats(quad, singleAce)).toBe(false);
  });

  it('a 3-pair run beats a single 2', () => {
    expect(beats(threePairRun, singleTwo)).toBe(true);
  });

  it('a 3-pair run does NOT beat a quad', () => {
    expect(beats(threePairRun, quad)).toBe(false);
  });

  it('a 3-pair run does NOT beat a pair of 2s', () => {
    expect(beats(threePairRun, pairOfTwos)).toBe(false);
  });

  it('a 4-pair run beats a single 2', () => {
    expect(beats(fourPairRun, singleTwo)).toBe(true);
  });

  it('a 4-pair run beats a pair of 2s', () => {
    expect(beats(fourPairRun, pairOfTwos)).toBe(true);
  });

  it('a 4-pair run beats any quad, even aces or 2s', () => {
    expect(beats(fourPairRun, quad)).toBe(true);
    expect(beats(fourPairRun, quadOfAces)).toBe(true);
    expect(beats(fourPairRun, quadOfTwos)).toBe(true);
  });

  it('a 4-pair run beats any 3-pair run, even a higher one', () => {
    expect(beats(fourPairRun, threePairRun)).toBe(true);
  });

  it('a 4-pair run does NOT beat non-2 singles, pairs, triples, or straights', () => {
    expect(beats(fourPairRun, singleAce)).toBe(false);
    expect(beats(fourPairRun, comboOf([d(14), h(14)]))).toBe(false);
    expect(beats(fourPairRun, comboOf([s(14), d(14), h(14)]))).toBe(false);
    expect(beats(fourPairRun, comboOf([s(12), c(13), d(14)]))).toBe(false);
  });

  it('nothing chops a non-2 single', () => {
    expect(beats(quad, singleAce)).toBe(false);
    expect(beats(threePairRun, singleAce)).toBe(false);
    expect(beats(fourPairRun, singleAce)).toBe(false);
    expect(beats(fivePairRun, singleAce)).toBe(false);
  });

  it('a single 2 still beats any other single normally', () => {
    expect(beats(singleTwo, singleAce)).toBe(true);
    expect(beats(singleAce, singleTwo)).toBe(false);
  });

  it('a 5-pair run gains no chop powers', () => {
    expect(beats(fivePairRun, singleTwo)).toBe(false);
    expect(beats(fivePairRun, pairOfTwos)).toBe(false);
    expect(beats(fivePairRun, quad)).toBe(false);
    expect(beats(fivePairRun, threePairRun)).toBe(false);
    expect(beats(fivePairRun, fourPairRun)).toBe(false);
  });

  it('a 5-pair run still beats a lower 5-pair run by top card', () => {
    const higherFive = comboOf([s(4), h(4), c(5), d(5), s(6), h(6), c(7), d(7), s(8), h(8)]);
    expect(beats(higherFive, fivePairRun)).toBe(true);
    expect(beats(fivePairRun, higherFive)).toBe(false);
  });
});

describe('comboLabel', () => {
  it('labels same-rank combos', () => {
    expect(comboLabel(comboOf([h(7)]))).toBe('single 7');
    expect(comboLabel(comboOf([h(14)]))).toBe('single Ace');
    expect(comboLabel(comboOf([d(12), h(12)]))).toBe('pair of Queens');
    expect(comboLabel(comboOf([s(15), h(15)]))).toBe('pair of 2s');
    expect(comboLabel(comboOf([s(13), d(13), h(13)]))).toBe('triple of Kings');
    expect(comboLabel(comboOf([s(7), c(7), d(7), h(7)]))).toBe('quad of 7s');
  });

  it('labels runs', () => {
    expect(comboLabel(comboOf([s(3), c(4), d(5)]))).toBe('straight (3 cards)');
    expect(comboLabel(comboOf([s(3), c(4), d(5), h(6), s(7), c(8)]))).toBe('straight (6 cards)');
    expect(comboLabel(comboOf([s(3), h(3), c(4), d(4), s(5), h(5)]))).toBe('3-pair run');
    expect(
      comboLabel(comboOf([s(3), h(3), c(4), d(4), s(5), h(5), c(6), d(6)])),
    ).toBe('4-pair run');
  });
});
