import type { NormalizedSurvey, OptionValue } from "./schema"
import { canRandomize } from "./schema"
import { hashString } from "./hash"

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Shown order of option values (or matrix row ids) for every randomised question.
 * Exclusive options (e.g. "None of the above") stay pinned at the end. Deterministic for a seed,
 * so a resumed session shows the same order.
 */
export function computeOptionOrder(survey: NormalizedSurvey, seed: number): Record<string, OptionValue[]> {
  const out: Record<string, OptionValue[]> = {}
  for (const q of survey.questions) {
    const rand = mulberry32(seed ^ parseInt(hashString(q.id), 16))
    if (canRandomize(q) && q.randomizeOptions && q.options.length > 1) {
      const pinned = q.options.filter((o) => "exclusive" in o && o.exclusive).map((o) => o.value)
      const free = q.options.filter((o) => !("exclusive" in o && o.exclusive)).map((o) => o.value)
      out[q.id] = [...shuffle(free, rand), ...pinned]
    } else if (q.type === "matrix" && q.randomizeRows && q.rows.length > 1) {
      out[q.id] = shuffle(
        q.rows.map((r) => r.id),
        rand,
      )
    }
  }
  return out
}

/** Reorder items by a recorded order of keys; unknown items keep their place at the end. */
export function applyOrder<T>(items: T[], order: OptionValue[] | undefined, key: (item: T) => OptionValue): T[] {
  if (!order) return items
  const index = new Map(order.map((v, i) => [String(v), i]))
  return [...items].sort((a, b) => (index.get(String(key(a))) ?? 1e9) - (index.get(String(key(b))) ?? 1e9))
}
