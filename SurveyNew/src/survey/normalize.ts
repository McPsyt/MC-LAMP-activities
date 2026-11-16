import type { ChoiceOption, NormalizedSurvey, Question, SurveyDefinition } from "./schema"
import { DEFAULT_APPEARANCE, DEFAULT_OPTIONS, ID_PATTERN, QUESTION_TYPES, SCHEMA_VERSION } from "./schema"
import { convertLegacySurvey, looksLikeLegacySettings } from "./legacy"

export class SurveyError extends Error {
  readonly code: "missing" | "invalid"
  constructor(code: "missing" | "invalid", message: string) {
    super(message)
    this.code = code
  }
}

const TYPES = new Set<string>(QUESTION_TYPES)
const CHOICE = new Set(["single", "dropdown", "multiple", "ranking"])

function cleanOptions(opts: unknown): ChoiceOption[] {
  if (!Array.isArray(opts)) return []
  return opts
    .filter((o): o is ChoiceOption => !!o && typeof o === "object" && "value" in o && o.value !== null && o.value !== "")
    .map((o) => ({ ...o, value: typeof o.value === "number" ? o.value : String(o.value) }))
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

function sanitizeQuestion(raw: Record<string, unknown>, index: number, used: Set<string>): Question | undefined {
  const type = String(raw.type ?? "")
  if (!TYPES.has(type)) return undefined
  let id = typeof raw.id === "string" && ID_PATTERN.test(raw.id) ? raw.id : `q${index + 1}`
  if (used.has(id)) {
    let k = 2
    while (used.has(`${id}_${k}`)) k++
    id = `${id}_${k}`
  }
  used.add(id)
  const q = { ...raw, id, type, text: raw.text ?? "" } as Record<string, unknown>
  if (CHOICE.has(type)) q.options = cleanOptions(raw.options)
  if (type === "likert" || type === "matrix") {
    if (raw.options !== undefined) q.options = cleanOptions(raw.options)
  }
  if (type === "matrix") {
    const rows = Array.isArray(raw.rows) ? raw.rows : []
    const rowIds = new Set<string>()
    q.rows = rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r, i) => {
        let rid = typeof r.id === "string" && ID_PATTERN.test(r.id) ? r.id : `r${i + 1}`
        while (rowIds.has(rid)) rid = `${rid}_${i + 1}`
        rowIds.add(rid)
        return { id: rid, text: r.text ?? "" }
      })
  }
  if (type === "slider") {
    q.min = num(raw.min, 0)
    q.max = num(raw.max, 10)
    if (Number(q.max) <= Number(q.min)) q.max = Number(q.min) + 1
  }
  if (type === "rating") {
    q.min = num(raw.min, 0)
    q.max = num(raw.max, 10)
  }
  return q as unknown as Question
}

/**
 * Validate loosely and fill defaults. Throws SurveyError when nothing usable is present.
 * Accepts legacy lamp.survey settings arrays too (converted on the fly).
 */
export function normalizeSurvey(input: unknown): NormalizedSurvey {
  if (input === null || input === undefined || (typeof input === "object" && Object.keys(input).length === 0)) {
    throw new SurveyError("missing", "Survey settings are missing.")
  }
  let raw: Partial<SurveyDefinition>
  if (looksLikeLegacySettings(input)) raw = convertLegacySurvey(input).survey
  else if (typeof input === "object" && !Array.isArray(input)) raw = input as Partial<SurveyDefinition>
  else throw new SurveyError("invalid", "Survey settings are not a survey definition.")

  if (!Array.isArray(raw.questions)) throw new SurveyError("invalid", "Survey has no questions list.")

  const used = new Set<string>()
  const questions = raw.questions
    .filter((q): q is Question => !!q && typeof q === "object")
    .map((q, i) => sanitizeQuestion(q as unknown as Record<string, unknown>, i, used))
    .filter((q): q is Question => !!q)

  const defaultLanguage = typeof raw.defaultLanguage === "string" && raw.defaultLanguage ? raw.defaultLanguage : "en"
  const languages = Array.isArray(raw.languages) && raw.languages.length > 0 ? raw.languages : [defaultLanguage]
  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    defaultLanguage,
    languages: languages.includes(defaultLanguage) ? languages : [defaultLanguage, ...languages],
    options: {
      ...DEFAULT_OPTIONS,
      ...(raw.options ?? {}),
      resume: { ...DEFAULT_OPTIONS.resume, ...(raw.options?.resume ?? {}) },
    },
    appearance: { ...DEFAULT_APPEARANCE, ...(raw.appearance ?? {}) },
    questions,
    scores: Array.isArray(raw.scores) ? raw.scores.filter((s) => s && typeof s.id === "string") : [],
    alerts: Array.isArray(raw.alerts) ? raw.alerts.filter((a) => a && typeof a.id === "string" && a.when) : [],
  }
}
