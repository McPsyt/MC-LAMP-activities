import { describe, expect, it } from "vitest"
import { applyOperator, evaluate, referencedQuestions } from "@/survey/conditions"

const ctx = (answers: Record<string, unknown>, scores: Record<string, number | null> = {}) => ({
  answers: answers as never,
  scores,
})

describe("applyOperator", () => {
  it("eq is case/whitespace-insensitive for strings and type-loose for numbers", () => {
    expect(applyOperator("eq", "Yes", "yes")).toBe(true)
    expect(applyOperator("eq", " Yes ", "Yes")).toBe(true)
    expect(applyOperator("eq", 3, "3")).toBe(true)
    expect(applyOperator("eq", "No", "Yes")).toBe(false)
  })
  it("unanswered values only satisfy `unanswered`", () => {
    for (const op of ["eq", "neq", "in", "notIn", "contains", "notContains", "gt", "lt"] as const) {
      expect(applyOperator(op, undefined, "x")).toBe(false)
      expect(applyOperator(op, "", "x")).toBe(false)
      expect(applyOperator(op, [], "x")).toBe(false)
    }
    expect(applyOperator("unanswered", undefined, undefined)).toBe(true)
    expect(applyOperator("answered", 0, undefined)).toBe(true)
  })
  it("array answers: contains / in / eq", () => {
    expect(applyOperator("contains", ["a", "b"], "b")).toBe(true)
    expect(applyOperator("contains", ["a", "b"], ["a", "b"])).toBe(true)
    expect(applyOperator("notContains", ["a"], "b")).toBe(true)
    expect(applyOperator("in", ["a", "c"], ["c", "d"])).toBe(true)
    expect(applyOperator("eq", ["b", "a"], ["a", "b"])).toBe(true)
    expect(applyOperator("eq", ["a"], ["a", "b"])).toBe(false)
  })
  it("numeric and time/date comparisons", () => {
    expect(applyOperator("gte", 10, 10)).toBe(true)
    expect(applyOperator("gt", "12", 3)).toBe(true)
    expect(applyOperator("lt", "07:30", "08:00")).toBe(true)
    expect(applyOperator("gt", "2026-11-16", "2026-01-01")).toBe(true)
  })
  it("text contains is case-insensitive", () => {
    expect(applyOperator("contains", "Headache today", "headache")).toBe(true)
  })
})

describe("evaluate", () => {
  it("combines all/any/not and score rules", () => {
    const c = {
      all: [
        { question: "a", op: "eq" as const, value: "Yes" },
        { any: [{ score: "total", op: "gte" as const, value: 10 }, { not: { question: "b", op: "answered" as const } }] },
      ],
    }
    expect(evaluate(c, ctx({ a: "Yes" }, { total: 3 }))).toBe(true)
    expect(evaluate(c, ctx({ a: "Yes", b: 1 }, { total: 3 }))).toBe(false)
    expect(evaluate(c, ctx({ a: "Yes", b: 1 }, { total: 12 }))).toBe(true)
    expect(evaluate(c, ctx({ a: "No" }, { total: 12 }))).toBe(false)
  })
  it("missing condition is true; null score only matches unanswered", () => {
    expect(evaluate(undefined, ctx({}))).toBe(true)
    expect(evaluate({ score: "s", op: "gte", value: 0 }, ctx({}, { s: null }))).toBe(false)
    expect(evaluate({ score: "s", op: "unanswered" }, ctx({}, { s: null }))).toBe(true)
  })
  it("lists referenced questions", () => {
    expect(referencedQuestions({ any: [{ question: "x", op: "eq", value: 1 }, { not: { question: "m.r1", op: "answered" } }] })).toEqual([
      "x",
      "m.r1",
    ])
  })
})
