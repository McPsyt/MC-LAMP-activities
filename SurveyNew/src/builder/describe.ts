import type { Condition, SurveyDefinition } from "@/survey/schema"
import { isQuestionRule, isScoreRule } from "@/survey/conditions"
import { allSubjects, operatorLabel, optionLabel, type Subject } from "./subjects"

function valueText(v: unknown, subject: Subject | undefined, lang: string): string {
  const one = (x: unknown) => {
    const o = subject?.options?.find((op) => String(op.value) === String(x))
    return o ? `"${optionLabel(o, lang)}"` : JSON.stringify(x)
  }
  return Array.isArray(v) ? v.map(one).join(" or ") : one(v)
}

/** Plain-English description of a condition, e.g. `"Did you take..." is "Yes"`. */
export function describeCondition(c: Condition | undefined, survey: SurveyDefinition): string {
  if (!c) return ""
  const lang = survey.defaultLanguage ?? "en"
  const subjects = new Map(allSubjects(survey).map((s) => [s.key, s]))
  const walk = (x: Condition): string => {
    if ("all" in x) return x.all.map(walk).join(" AND ")
    if ("any" in x) return x.any.length > 1 ? `(${x.any.map(walk).join(" OR ")})` : x.any.map(walk).join("")
    if ("not" in x) return `NOT (${walk(x.not)})`
    if (isQuestionRule(x) || isScoreRule(x)) {
      const key = isScoreRule(x) ? `score:${x.score}` : x.question
      const s = subjects.get(key)
      const name = s ? s.label.replace(/^\d+\.\s/, "") : key
      const op = operatorLabel(x.op, s?.kind ?? "text")
      const needs = x.op !== "answered" && x.op !== "unanswered"
      return `"${name}" ${op}${needs ? ` ${valueText(x.value, s, lang)}` : ""}`
    }
    return "?"
  }
  return walk(c)
}
