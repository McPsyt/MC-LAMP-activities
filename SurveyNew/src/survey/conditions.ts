import type { Answers, Condition, Operator, QuestionRule, ScoreRule } from "./schema"
import { isAnswered } from "./values"

export interface ConditionContext {
  answers: Answers
  scores: Record<string, number | null>
}

export function isQuestionRule(c: Condition): c is QuestionRule {
  return typeof (c as QuestionRule).question === "string"
}

export function isScoreRule(c: Condition): c is ScoreRule {
  return typeof (c as ScoreRule).score === "string"
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : String(v))

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b
  if (a == null || b == null) return false
  return norm(a) === norm(b)
}

function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v === undefined || v === null) return []
  return [v]
}

function compare(a: unknown, b: unknown): number | undefined {
  const na = typeof a === "number" ? a : typeof a === "string" && a.trim() !== "" ? Number(a) : NaN
  const nb = typeof b === "number" ? b : typeof b === "string" && b.trim() !== "" ? Number(b) : NaN
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  // Times ("08:30") and dates ("2026-11-16") compare correctly as strings.
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0
  return undefined
}

/** Apply an operator to an answered value. */
export function applyOperator(op: Operator, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "answered":
      return isAnswered(actual)
    case "unanswered":
      return !isAnswered(actual)
  }
  if (!isAnswered(actual)) return false
  switch (op) {
    case "eq":
      if (Array.isArray(actual)) {
        const exp = toList(expected)
        return actual.length === exp.length && actual.every((a) => exp.some((e) => looseEq(a, e)))
      }
      return looseEq(actual, expected)
    case "neq":
      return !applyOperator("eq", actual, expected)
    case "in": {
      const list = toList(expected)
      return toList(actual).some((a) => list.some((e) => looseEq(a, e)))
    }
    case "notIn":
      return !applyOperator("in", actual, expected)
    case "contains":
      if (Array.isArray(actual)) return toList(expected).every((e) => actual.some((a) => looseEq(a, e)))
      return norm(actual).includes(norm(expected))
    case "notContains":
      return !applyOperator("contains", actual, expected)
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const c = compare(actual, expected)
      if (c === undefined) return false
      return op === "gt" ? c > 0 : op === "gte" ? c >= 0 : op === "lt" ? c < 0 : c <= 0
    }
    default:
      return false
  }
}

/** Evaluate a condition. Missing conditions are true. Unanswered/hidden values only satisfy `unanswered`. */
export function evaluate(condition: Condition | undefined | null, ctx: ConditionContext): boolean {
  if (!condition || typeof condition !== "object") return true
  if ("all" in condition && Array.isArray(condition.all)) return condition.all.every((c) => evaluate(c, ctx))
  if ("any" in condition && Array.isArray(condition.any)) {
    return condition.any.length === 0 ? true : condition.any.some((c) => evaluate(c, ctx))
  }
  if ("not" in condition && condition.not) return !evaluate(condition.not, ctx)
  if (isQuestionRule(condition)) return applyOperator(condition.op, ctx.answers[condition.question], condition.value)
  if (isScoreRule(condition)) {
    const s = ctx.scores[condition.score]
    return applyOperator(condition.op, s ?? null, condition.value)
  }
  return true
}

/** All question keys referenced by a condition. */
export function referencedQuestions(condition: Condition | undefined): string[] {
  if (!condition) return []
  if ("all" in condition && Array.isArray(condition.all)) return condition.all.flatMap(referencedQuestions)
  if ("any" in condition && Array.isArray(condition.any)) return condition.any.flatMap(referencedQuestions)
  if ("not" in condition && condition.not) return referencedQuestions(condition.not)
  if (isQuestionRule(condition)) return [condition.question]
  return []
}

export function referencedScores(condition: Condition | undefined): string[] {
  if (!condition) return []
  if ("all" in condition && Array.isArray(condition.all)) return condition.all.flatMap(referencedScores)
  if ("any" in condition && Array.isArray(condition.any)) return condition.any.flatMap(referencedScores)
  if ("not" in condition && condition.not) return referencedScores(condition.not)
  if (isScoreRule(condition)) return [condition.score]
  return []
}
