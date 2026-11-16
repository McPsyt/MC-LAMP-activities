import type { AnswerValue, Answers, Question } from "./schema"
import { OTHER_VALUE, isDisplayItem, isRequired } from "./schema"
import { hasOther } from "./options"
import type { Translator } from "./i18n"
import { formatDateForDisplay, parseIsoDate, resolveDateBound } from "./dates"

export function isAnswered(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "string") return v.trim() !== ""
  if (typeof v === "number") return Number.isFinite(v)
  if (Array.isArray(v)) return v.length > 0
  return true
}

export const otherKey = (id: string) => `${id}.other`
export const rowKey = (id: string, rowId: string) => `${id}.${rowId}`

/** Answer keys a question writes (matrix rows, "other" text). */
export function answerKeys(q: Question): string[] {
  if (isDisplayItem(q)) return []
  if (q.type === "matrix") return q.rows.map((r) => rowKey(q.id, r.id))
  return hasOther(q) ? [q.id, otherKey(q.id)] : [q.id]
}

export function otherSelected(q: Question, answers: Answers): boolean {
  if (!hasOther(q)) return false
  const v = answers[q.id]
  return Array.isArray(v) ? v.includes(OTHER_VALUE) : v === OTHER_VALUE
}

/** Is the question complete enough to count as answered (for progress, numbering, piping)? */
export function questionAnswered(q: Question, answers: Answers): boolean {
  if (isDisplayItem(q)) return false
  if (q.type === "matrix") return q.rows.length > 0 && q.rows.every((r) => isAnswered(answers[rowKey(q.id, r.id)]))
  return isAnswered(answers[q.id])
}

export function questionTouched(q: Question, answers: Answers): boolean {
  return answerKeys(q).some((k) => isAnswered(answers[k]))
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function countDecimals(n: number): number {
  const s = String(n)
  if (s.includes("e-")) return Number(s.split("e-")[1])
  return s.includes(".") ? s.split(".")[1].length : 0
}

/** Validation message for a visible question, or null when valid. */
export function validateQuestion(
  q: Question,
  answers: Answers,
  t: Translator,
  language: string,
  now: Date = new Date(),
): string | null {
  if (isDisplayItem(q)) return null
  const v = answers[q.id]
  const required = isRequired(q)

  if (q.type === "matrix") {
    const missing = q.rows.some((r) => !isAnswered(answers[rowKey(q.id, r.id)]))
    if (required && missing) return t("errMatrix")
    return null
  }

  if (!isAnswered(v)) return required ? t("errRequired") : null

  if (otherSelected(q, answers) && !isAnswered(answers[otherKey(q.id)])) return t("errOther")

  switch (q.type) {
    case "multiple": {
      const n = Array.isArray(v) ? v.length : 0
      if (q.minSelected && n < q.minSelected) return t("errMinSelected", { n: q.minSelected })
      if (q.maxSelected && n > q.maxSelected) return t("errMaxSelected", { n: q.maxSelected })
      return null
    }
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) return t("errNumber")
      if (q.min != null && v < q.min) return t("errMin", { n: q.min })
      if (q.max != null && v > q.max) return t("errMax", { n: q.max })
      const dec = q.decimals ?? 0
      if (countDecimals(v) > dec) return dec === 0 ? t("errWhole") : t("errDecimals", { n: dec })
      return null
    }
    case "short":
    case "text": {
      const s = String(v)
      const max = q.maxLength ?? (q.type === "text" ? 2000 : 250)
      if (s.length > max) return t("errMaxLength", { n: max })
      if (q.type === "short" && q.inputMode === "email" && !EMAIL.test(s.trim())) return t("errEmail")
      return null
    }
    case "date":
    case "datetime": {
      const iso = String(v).slice(0, 10)
      if (!parseIsoDate(iso)) return t("errRequired")
      const min = resolveDateBound(q.minDate, now)
      const max = resolveDateBound(q.maxDate, now)
      if (min && iso < min) return t("errDateMin", { d: formatDateForDisplay(min, language) })
      if (max && iso > max) return t("errDateMax", { d: formatDateForDisplay(max, language) })
      return null
    }
    case "duration": {
      const maxH = q.maxHours ?? 24
      if (typeof v === "number" && v > maxH * 60) return t("errDuration", { n: maxH })
      return null
    }
    default:
      return null
  }
}

/** Normalise a value before it is written to results (trim strings, etc.). */
export function outputValue(v: AnswerValue | undefined): AnswerValue {
  if (v === undefined) return null
  if (typeof v === "string") {
    const s = v.trim()
    return s === "" ? null : s
  }
  if (Array.isArray(v)) return v.length ? [...v] : null
  return v
}
