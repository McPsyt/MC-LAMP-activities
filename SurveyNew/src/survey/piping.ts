import type { Answers, NormalizedSurvey, Question } from "./schema"
import { OTHER_VALUE } from "./schema"
import type { Translator } from "./i18n"
import { resolveText } from "./i18n"
import { findOption } from "./options"
import { formatDateForDisplay, formatDuration, formatTimeForDisplay, splitDateTime } from "./dates"
import { isAnswered, otherKey } from "./values"

const PIPE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?)\s*\}\}/g

function findQuestion(survey: NormalizedSurvey, key: string): { q: Question; key: string } | undefined {
  const direct = survey.questions.find((q) => q.id === key)
  if (direct) return { q: direct, key }
  const [id] = key.split(".")
  const q = survey.questions.find((x) => x.id === id)
  return q ? { q, key } : undefined
}

/** Human-readable answer, as shown to the participant (labels, formatted times). */
export function displayAnswer(
  survey: NormalizedSurvey,
  key: string,
  answers: Answers,
  language: string,
  t: Translator,
): string {
  const found = findQuestion(survey, key)
  if (!found) return ""
  const { q } = found
  const v = answers[found.key]
  if (!isAnswered(v)) return ""
  const lang = language
  const fb = survey.defaultLanguage
  const label = (val: unknown) => {
    if (val === OTHER_VALUE && (q.type === "single" || q.type === "dropdown" || q.type === "multiple") && q.allowOther) {
      return String(answers[otherKey(q.id)] ?? "") || resolveText(q.otherLabel, lang, fb) || t("other")
    }
    const opt = findOption(q, val, t)
    return opt ? resolveText(opt.label, lang, fb) || String(opt.value) : String(val)
  }
  if (found.key === otherKey(q.id)) return String(v)
  switch (q.type) {
    case "multiple":
    case "ranking":
      return (Array.isArray(v) ? v : [v]).map(label).join(", ")
    case "single":
    case "dropdown":
    case "boolean":
    case "likert":
    case "matrix":
    case "faces":
      return label(v)
    case "time":
      return formatTimeForDisplay(String(v), q.format ?? "12h", lang)
    case "date":
      return formatDateForDisplay(String(v), lang)
    case "datetime": {
      const { date, time } = splitDateTime(v)
      return [date && formatDateForDisplay(date, lang), time && formatTimeForDisplay(time, q.format ?? "12h", lang)]
        .filter(Boolean)
        .join(" ")
    }
    case "duration":
      return formatDuration(Number(v), t("hoursShort"), t("minutesShort"))
    case "number":
    case "slider": {
      const unit = resolveText(q.unit, lang, fb)
      return unit ? `${v} ${unit}` : String(v)
    }
    default:
      return String(v)
  }
}

/** Escape Markdown so participant answers render literally. */
function escapeMarkdown(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|>~<])/g, "\\$1")
}

/** Replace {{question_id}} placeholders with answers (Markdown-escaped). */
export function pipeText(
  text: string,
  survey: NormalizedSurvey,
  answers: Answers,
  language: string,
  t: Translator,
): string {
  if (!text.includes("{{")) return text
  return text.replace(PIPE, (_, key: string) => escapeMarkdown(displayAnswer(survey, key, answers, language, t)))
}

export function pipedKeys(text: string): string[] {
  return [...text.matchAll(PIPE)].map((m) => m[1])
}
