import { describe, expect, it } from "vitest"
import { validateQuestion, isAnswered } from "@/survey/values"
import { buildResult } from "@/survey/payload"
import { makeTranslator } from "@/survey/i18n"
import type { Question } from "@/survey/schema"
import { medication, survey } from "../helpers"

const t = makeTranslator("en")
const v = (q: Question, answers: Record<string, unknown>, now = new Date(2026, 10, 16)) =>
  validateQuestion(q, answers as never, t, "en", now)

describe("validation", () => {
  it("required vs optional", () => {
    expect(v({ id: "a", type: "short", text: "A" }, {})).toBe("Please answer this question.")
    expect(v({ id: "a", type: "short", text: "A", required: false }, {})).toBeNull()
    expect(v({ id: "a", type: "short", text: "A" }, { a: "   " })).toBe("Please answer this question.")
  })
  it("numbers: range, decimals, junk", () => {
    const q: Question = { id: "n", type: "number", text: "N", min: 0, max: 10, decimals: 1 }
    expect(v(q, { n: 11 })).toBe("Enter 10 or less.")
    expect(v(q, { n: -1 })).toBe("Enter 0 or more.")
    expect(v(q, { n: 1.25 })).toBe("Use at most 1 decimal places.")
    expect(v(q, { n: "abc" })).toBe("Enter a valid number.")
    expect(v({ ...q, decimals: 0 }, { n: 2.5 })).toBe("Enter a whole number.")
    expect(v(q, { n: 0 })).toBeNull()
  })
  it("multiple min/max and Other text", () => {
    const q: Question = { id: "m", type: "multiple", text: "M", minSelected: 2, maxSelected: 3, options: [], allowOther: true }
    expect(v(q, { m: ["a"] })).toBe("Select at least 2.")
    expect(v(q, { m: ["a", "b", "c", "d"] })).toBe("Select no more than 3.")
    expect(v(q, { m: ["a", "other"] })).toBe("Please describe your answer.")
    expect(v(q, { m: ["a", "other"], "m.other": "x" })).toBeNull()
  })
  it("matrix requires every row; dates respect bounds", () => {
    const m: Question = { id: "g", type: "matrix", text: "G", rows: [{ id: "r1", text: "1" }, { id: "r2", text: "2" }] }
    expect(v(m, { "g.r1": 1 })).toBe("Please answer every row.")
    expect(v(m, { "g.r1": 1, "g.r2": 0 })).toBeNull()
    const d: Question = { id: "d", type: "date", text: "D", maxDate: "today", minDate: "-7d" }
    expect(v(d, { d: "2026-11-17" })).toMatch(/on or before/)
    expect(v(d, { d: "2026-11-01" })).toMatch(/on or after/)
    expect(v(d, { d: "2026-11-12" })).toBeNull()
  })
  it("email format for short text", () => {
    const q: Question = { id: "e", type: "short", text: "E", inputMode: "email" }
    expect(v(q, { e: "nope" })).toBe("Enter a valid email address.")
    expect(v(q, { e: "a@b.co" })).toBeNull()
  })
  it("isAnswered treats 0 and false-y numbers as answers", () => {
    expect(isAnswered(0)).toBe(true)
    expect(isAnswered([])).toBe(false)
  })
})

describe("buildResult", () => {
  const base = { durations: { dose_taken: 1200, dose_time: 3400 }, startTime: 1000, now: 9000, language: "en-US", optionOrder: {}, resumed: false }

  it("medication No: time question skipped with null value", () => {
    const r = buildResult({ ...base, survey: survey(medication), answers: { dose_taken: "No", dose_time: "08:00" } })
    expect(r.timestamp).toBe(1000)
    expect(r.duration).toBe(8000)
    expect(r.temporal_slices).toEqual([
      { item: "Did you already take your first dose of medication?", value: "No", type: null, level: null, duration: 1200 },
      { item: "At what time?", value: null, type: null, level: null, duration: 0 },
    ])
    expect(r.static_data.skipped).toEqual(["dose_time"])
    expect(r.static_data.answers).toEqual({ dose_taken: "No" })
  })

  it("medication Yes: both answered", () => {
    const r = buildResult({ ...base, survey: survey(medication), answers: { dose_taken: "Yes", dose_time: "08:00" } })
    expect(r.temporal_slices.map((s) => s.value)).toEqual(["Yes", "08:00"])
    expect(r.static_data.skipped).toEqual([])
  })

  it("expands matrix rows, adds an Other slice, uses default-language un-piped item text, skips display items", () => {
    const s = survey(
      [
        { id: "i", type: "info", text: "Hello" },
        { id: "g", type: "matrix", text: "Grid", rows: [{ id: "r1", text: { en: "Row 1", fr: "Ligne 1" } }, { id: "r2", text: "Row 2" }] },
        { id: "c", type: "single", text: { en: "Pick for {{g.r1}}", fr: "Choisir" }, options: [{ value: "a" }], allowOther: true },
      ],
      { defaultLanguage: "en", languages: ["en", "fr"] },
    )
    const r = buildResult({ ...base, language: "fr-FR", survey: s, answers: { "g.r1": 2, c: "other", "c.other": "  mine " } })
    expect(r.temporal_slices.map((x) => [x.item, x.value])).toEqual([
      ["Row 1", 2],
      ["Row 2", null],
      ["Pick for {{g.r1}}", "other"],
      ["Pick for {{g.r1}} (Other)", "mine"],
    ])
    expect(r.static_data.answers).toEqual({ "g.r1": 2, c: "other", "c.other": "mine" })
    expect(r.static_data.language).toBe("fr-FR")
  })

  it("records scores, triggered alerts, survey version and the shown option order", () => {
    const s = survey(
      [{ id: "q", type: "rating", text: "Q", min: 0, max: 3 }, { id: "o", type: "single", text: "O", options: [{ value: "a" }, { value: "b" }], randomizeOptions: true }],
      {
        id: "inst",
        version: "7",
        scores: [{ id: "total", method: "sum", questions: ["q"] }],
        alerts: [{ id: "hi", when: { score: "total", op: "gte", value: 2 }, message: "!", severity: "warning", timing: "submit" }],
      },
    )
    const r = buildResult({ ...base, survey: s, answers: { q: 3, o: "b" }, optionOrder: { o: ["b", "a"] } })
    expect(r.static_data.scores).toEqual({ total: 3 })
    expect(r.static_data.alerts).toEqual(["hi"])
    expect(r.static_data.survey).toEqual({ schema: 1, id: "inst", version: "7" })
    expect(r.static_data.option_order).toEqual({ o: ["b", "a"] })
  })

  it("result survives the dashboard's JSON.parse round trip", () => {
    const r = buildResult({ ...base, survey: survey(medication), answers: { dose_taken: "Yes" } })
    const parsed = JSON.parse(JSON.stringify(r))
    expect(!!parsed.timestamp).toBe(true)
    expect(parsed.temporal_slices).toHaveLength(2)
  })
})
