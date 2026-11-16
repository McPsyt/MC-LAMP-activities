import { describe, expect, it } from "vitest"
import { computeScores, itemScore } from "@/survey/scoring"
import { displayAnswer, pipeText } from "@/survey/piping"
import { makeTranslator } from "@/survey/i18n"
import { computeOptionOrder } from "@/survey/randomize"
import { survey } from "../helpers"

const t = makeTranslator("en")

describe("scoring", () => {
  const s = survey(
    [
      { id: "m", type: "matrix", text: "M", preset: "frequency4", rows: [{ id: "r1", text: "R1" }, { id: "r2", text: "R2" }] },
      { id: "c", type: "single", text: "C", options: [{ value: "lo", score: 1 }, { value: "hi", score: 5 }] },
      { id: "x", type: "multiple", text: "X", options: [{ value: "a" }, { value: "b" }] },
      { id: "yn", type: "boolean", text: "YN" },
    ],
    {
      scores: [
        { id: "sum", method: "sum", questions: ["m", "c"] },
        { id: "mean", method: "mean", questions: ["m.r1", "m.r2"] },
        { id: "count", method: "count", questions: ["m", "c", "yn"] },
      ],
    },
  )
  it("sums matrix rows and option scores; mean and count", () => {
    expect(computeScores(s, { "m.r1": 3, "m.r2": 1, c: "hi" })).toEqual({ sum: 9, mean: 2, count: 3 })
  })
  it("returns null when nothing scored (count returns 0)", () => {
    expect(computeScores(s, {})).toEqual({ sum: null, mean: null, count: 0 })
  })
  it("multiple without numeric scores counts selections; boolean Yes=1 No=0", () => {
    expect(itemScore(s.questions[2], ["a", "b"])).toBe(2)
    expect(itemScore(s.questions[3], "Yes")).toBe(1)
    expect(itemScore(s.questions[3], "No")).toBe(0)
  })
})

describe("piping", () => {
  const s = survey([
    { id: "dose_time", type: "time", text: "When?", format: "12h" },
    { id: "pick", type: "single", text: "Pick", options: [{ value: "a", label: { en: "Apple", fr: "Pomme" } }] },
    { id: "free", type: "short", text: "Free" },
    { id: "dur", type: "duration", text: "D" },
  ])
  it("shows formatted answers", () => {
    expect(displayAnswer(s, "dose_time", { dose_time: "08:05" }, "en", t)).toBe("8:05 AM")
    expect(displayAnswer(s, "pick", { pick: "a" }, "fr", t)).toBe("Pomme")
    expect(displayAnswer(s, "dur", { dur: 450 }, "en", t)).toBe("7 h 30 min")
  })
  it("replaces placeholders and escapes Markdown in answers", () => {
    expect(pipeText("Since {{dose_time}}?", s, { dose_time: "14:30" }, "en", t)).toBe("Since 2:30 PM?")
    expect(pipeText("You said {{free}}", s, { free: "**hi**" }, "en", t)).toBe("You said \\*\\*hi\\*\\*")
    expect(pipeText("Missing: {{nope}} {{free}}", s, {}, "en", t)).toBe("Missing:  ")
  })
})

describe("randomize", () => {
  const s = survey([
    {
      id: "r",
      type: "multiple",
      text: "R",
      randomizeOptions: true,
      options: ["a", "b", "c", "d", "e", "f"].map((v) => ({ value: v })).concat([{ value: "none", exclusive: true } as never]),
    },
    { id: "plain", type: "single", text: "P", options: [{ value: 1 }, { value: 2 }] },
  ])
  it("is deterministic per seed, keeps exclusive options last, skips non-randomised", () => {
    const a = computeOptionOrder(s, 42)
    expect(a).toEqual(computeOptionOrder(s, 42))
    expect(a.r).toHaveLength(7)
    expect(a.r.at(-1)).toBe("none")
    expect([...a.r].sort()).toEqual(["a", "b", "c", "d", "e", "f", "none"])
    expect(a.plain).toBeUndefined()
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => computeOptionOrder(s, seed).r.join()))
    expect(orders.size).toBeGreaterThan(1)
  })
})
