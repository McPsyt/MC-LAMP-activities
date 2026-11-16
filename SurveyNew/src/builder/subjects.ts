/**
 * "Subjects" a rule can test: answer keys of earlier questions (incl. matrix rows and Other text) and scores.
 */
import type { ChoiceOption, Operator, Question, SurveyDefinition } from "@/survey/schema"
import { isDisplayItem } from "@/survey/schema"
import { getOptions, hasOther } from "@/survey/options"
import { getDefaultL } from "./lstring"

export type ValueKind = "choice" | "multi" | "number" | "text" | "date" | "time" | "datetime" | "none"

export interface Subject {
  key: string
  label: string
  kind: ValueKind
  options?: ChoiceOption[]
  isScore?: boolean
}

const OPS: Record<ValueKind, Operator[]> = {
  choice: ["eq", "neq", "in", "notIn", "answered", "unanswered"],
  multi: ["contains", "notContains", "answered", "unanswered"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "answered", "unanswered"],
  text: ["eq", "neq", "contains", "notContains", "answered", "unanswered"],
  date: ["eq", "lt", "lte", "gt", "gte", "answered", "unanswered"],
  time: ["eq", "lt", "lte", "gt", "gte", "answered", "unanswered"],
  datetime: ["lt", "gt", "answered", "unanswered"],
  none: ["answered", "unanswered"],
}

export function operatorsFor(kind: ValueKind, numericChoice = false): Operator[] {
  if (kind === "choice" && numericChoice) return ["eq", "neq", "in", "notIn", "gt", "gte", "lt", "lte", "answered", "unanswered"]
  return OPS[kind]
}

export function operatorLabel(op: Operator, kind: ValueKind): string {
  const temporal = kind === "date" || kind === "time" || kind === "datetime"
  switch (op) {
    case "eq":
      return "is"
    case "neq":
      return "is not"
    case "in":
      return "is any of"
    case "notIn":
      return "is none of"
    case "contains":
      return kind === "multi" ? "includes" : "contains"
    case "notContains":
      return kind === "multi" ? "does not include" : "does not contain"
    case "gt":
      return temporal ? "is after" : "is more than"
    case "gte":
      return temporal ? "is on/after" : "is at least"
    case "lt":
      return temporal ? "is before" : "is less than"
    case "lte":
      return temporal ? "is on/before" : "is at most"
    case "answered":
      return "is answered"
    case "unanswered":
      return "is not answered"
  }
}

export const needsValue = (op: Operator) => op !== "answered" && op !== "unanswered"

function kindOf(q: Question): ValueKind {
  switch (q.type) {
    case "single":
    case "dropdown":
    case "likert":
    case "boolean":
    case "faces":
    case "rating":
      return "choice"
    case "multiple":
    case "ranking":
      return "multi"
    case "slider":
    case "vas":
    case "number":
    case "duration":
      return "number"
    case "short":
    case "text":
      return "text"
    case "date":
      return "date"
    case "time":
      return "time"
    case "datetime":
      return "datetime"
    default:
      return "none"
  }
}

const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}...` : s)

/** Subjects available to a rule placed at `index` (earlier questions only; `includeSelf` for end-survey rules). */
export function subjectsBefore(survey: SurveyDefinition, index: number, includeSelf = false, includeScores = true): Subject[] {
  const lang = survey.defaultLanguage ?? "en"
  const out: Subject[] = []
  const limit = includeSelf ? index + 1 : index
  survey.questions.slice(0, Math.max(0, limit)).forEach((q, i) => {
    if (isDisplayItem(q)) return
    const n = i + 1
    const title = short(getDefaultL(q.text, lang) || q.id)
    if (q.type === "matrix") {
      const cols = getOptions(q)
      q.rows.forEach((r) => out.push({ key: `${q.id}.${r.id}`, label: `${n}. ${title} > ${short(getDefaultL(r.text, lang) || r.id, 32)}`, kind: "choice", options: cols }))
      return
    }
    out.push({ key: q.id, label: `${n}. ${title}`, kind: kindOf(q), options: getOptions(q) })
    if (hasOther(q)) out.push({ key: `${q.id}.other`, label: `${n}. ${title} > "Other" text`, kind: "text" })
  })
  if (includeScores) {
    for (const s of survey.scores ?? []) out.push({ key: `score:${s.id}`, label: `Score: ${getDefaultL(s.label, lang) || s.id}`, kind: "number", isScore: true })
  }
  return out
}

/** Every answer key in the survey (alerts may use any question). */
export function allSubjects(survey: SurveyDefinition): Subject[] {
  return subjectsBefore(survey, survey.questions.length, false, true)
}

export function optionLabel(o: ChoiceOption, lang: string): string {
  return getDefaultL(o.label, lang) || String(o.value)
}
