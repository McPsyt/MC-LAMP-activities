import { describe, expect, it } from "vitest"
import { computeVisibility } from "@/survey/visibility"
import { buildPages, locatePage } from "@/survey/pages"
import { medication, survey } from "../helpers"

describe("computeVisibility", () => {
  it("shows the follow-up only for Yes (the medication example)", () => {
    const s = survey(medication)
    expect([...computeVisibility(s, {}).visible]).toEqual(["dose_taken"])
    expect([...computeVisibility(s, { dose_taken: "Yes" }).visible]).toEqual(["dose_taken", "dose_time"])
    expect([...computeVisibility(s, { dose_taken: "No" }).visible]).toEqual(["dose_taken"])
  })

  it("cascades: hiding a question hides its dependants and ignores hidden answers", () => {
    const s = survey([
      { id: "a", type: "boolean", text: "A" },
      { id: "b", type: "boolean", text: "B", showIf: { question: "a", op: "eq", value: "Yes" } },
      { id: "c", type: "short", text: "C", showIf: { question: "b", op: "eq", value: "Yes" } },
    ])
    const shown = computeVisibility(s, { a: "Yes", b: "Yes" })
    expect([...shown.visible]).toEqual(["a", "b", "c"])
    const hidden = computeVisibility(s, { a: "No", b: "Yes", c: "kept" })
    expect([...hidden.visible]).toEqual(["a"])
    expect(hidden.effective).toEqual({ a: "No" })
  })

  it("endSurveyIf ends the survey after the question", () => {
    const s = survey([
      { id: "consent", type: "boolean", text: "Consent?", endSurveyIf: { question: "consent", op: "eq", value: "No" } },
      { id: "q2", type: "short", text: "Q2" },
      { id: "q3", type: "short", text: "Q3" },
    ])
    const v = computeVisibility(s, { consent: "No" })
    expect([...v.visible]).toEqual(["consent"])
    expect(v.terminatedAt).toBe("consent")
    expect([...computeVisibility(s, { consent: "Yes" }).visible]).toEqual(["consent", "q2", "q3"])
  })

  it("showIf can use scores of earlier questions", () => {
    const s = survey(
      [
        { id: "a", type: "rating", text: "A", min: 0, max: 3 },
        { id: "b", type: "rating", text: "B", min: 0, max: 3 },
        { id: "follow", type: "text", text: "F", showIf: { score: "total", op: "gte", value: 4 } },
      ],
      { scores: [{ id: "total", method: "sum", questions: ["a", "b"] }] },
    )
    expect(computeVisibility(s, { a: 1, b: 1 }).visible.has("follow")).toBe(false)
    expect(computeVisibility(s, { a: 2, b: 2 }).visible.has("follow")).toBe(true)
  })
})

describe("pages", () => {
  const qs = survey(
    [
      { id: "s1", type: "section", text: "One" },
      { id: "a", type: "short", text: "A" },
      { id: "b", type: "short", text: "B", showIf: { question: "a", op: "answered" } },
      { id: "s2", type: "section", text: "Two" },
      { id: "c", type: "short", text: "C" },
    ],
    { options: { layout: "section" } },
  )
  it("groups by section", () => {
    const pages = buildPages(qs, computeVisibility(qs, { a: "x" }).visible)
    expect(pages.map((p) => p.items.map((q) => q.id))).toEqual([
      ["s1", "a", "b"],
      ["s2", "c"],
    ])
  })
  it("one question per page and single-page layouts", () => {
    const q = { ...qs, options: { ...qs.options, layout: "question" as const } }
    expect(buildPages(q, computeVisibility(q, {}).visible).map((p) => p.key)).toEqual(["s1", "a", "s2", "c"])
    const one = { ...qs, options: { ...qs.options, layout: "single" as const } }
    expect(buildPages(one, computeVisibility(one, {}).visible)).toHaveLength(1)
  })
  it("locatePage falls forward when the current page disappears", () => {
    const q = { ...qs, options: { ...qs.options, layout: "question" as const } }
    const pages = buildPages(q, computeVisibility(q, {}).visible)
    expect(pages[locatePage(q, pages, "b")].key).toBe("s2")
    expect(locatePage(q, pages, null)).toBe(0)
  })
})
