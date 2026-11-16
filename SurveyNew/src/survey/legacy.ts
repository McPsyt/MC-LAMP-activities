/**
 * Convert legacy `lamp.survey` settings (array of {text, type, required, description, options, warnings})
 * into a SurveyNew definition. Used by the builder's import and as a runtime fallback.
 */
import type { AlertDefinition, ChoiceOption, Question, SurveyDefinition } from "./schema"
import { SCHEMA_VERSION } from "./schema"

interface LegacyOption {
  value?: unknown
  description?: string | null
}
export interface LegacyQuestion {
  text?: string
  type?: string
  required?: boolean
  description?: string | null
  options?: LegacyOption[] | Array<string | number> | null | { timePattern?: string }
  warnings?: Array<{ answer?: string; warningText?: string }>
}

const LEGACY_LIKERT: ChoiceOption[] = [
  { value: 3, label: "Nearly All the Time" },
  { value: 2, label: "More than Half the Time" },
  { value: 1, label: "Several Times" },
  { value: 0, label: "Not at all" },
]

function legacyOptions(q: LegacyQuestion): LegacyOption[] {
  if (!Array.isArray(q.options)) return []
  return (q.options as unknown[]).map((o) =>
    o !== null && typeof o === "object" ? (o as LegacyOption) : { value: o, description: "" },
  )
}

function choiceOptions(q: LegacyQuestion): ChoiceOption[] {
  return legacyOptions(q)
    .filter((o) => o.value !== undefined && o.value !== null && String(o.value) !== "")
    .map((o) => ({ value: String(o.value), ...(o.description ? { description: o.description } : {}) }))
}

function numericOptions(q: LegacyQuestion): Array<{ value: number; description?: string }> {
  return legacyOptions(q)
    .map((o) => ({ value: Number(o.value), description: o.description ?? undefined }))
    .filter((o) => Number.isFinite(o.value))
    .sort((a, b) => a.value - b.value)
}

function desc(q: LegacyQuestion) {
  return q.description ? { description: q.description } : {}
}

function cleanAnswer(a: unknown): string {
  return String(a ?? "").replace(/^"+|"+$/g, "")
}

/** Columns for a matrix built from the head question's type. Undefined = not a single-choice grid. */
function matrixColumns(head: LegacyQuestion): ChoiceOption[] | undefined {
  switch (head.type) {
    case "boolean":
      return [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ]
    case "likert":
      return LEGACY_LIKERT
    case "list":
    case "select":
      return choiceOptions(head)
    case "rating":
    case "slider":
      return numericOptions(head).map((o) => ({ value: o.value, ...(o.description ? { label: o.description } : {}) }))
    default:
      return undefined
  }
}

function convertOne(q: LegacyQuestion, id: string): Question | undefined {
  const base = { id, text: q.text ?? "", required: q.required ?? false, ...desc(q) }
  switch (q.type) {
    case "list":
    case "select":
      return { ...base, type: "single", options: choiceOptions(q) }
    case "multiselect":
      return { ...base, type: "multiple", options: choiceOptions(q) }
    case "boolean":
      return { ...base, type: "boolean" }
    case "likert":
      return { ...base, type: "likert", options: LEGACY_LIKERT }
    case "short":
      return { ...base, type: "short" }
    case "text":
      return { ...base, type: "text", maxLength: 800 }
    case "time": {
      const opts = q.options as unknown
      const pattern = Array.isArray(opts)
        ? (opts[0] as LegacyOption | undefined)?.value
        : (opts as { timePattern?: string } | null)?.timePattern
      return { ...base, type: "time", format: pattern === "military" ? "24h" : "12h", minuteStep: 5 }
    }
    case "slider": {
      const o = numericOptions(q)
      if (o.length === 0) return { ...base, type: "slider", min: 0, max: 10, step: 1 }
      const step = o.length > 1 ? Math.abs(o[1].value - o[0].value) || 1 : 1
      return {
        ...base,
        type: "slider",
        min: o[0].value,
        max: o[o.length - 1].value,
        step,
        ...(o[0].description ? { minLabel: o[0].description } : {}),
        ...(o.length > 2 && o[Math.floor(o.length / 2)].description ? { midLabel: o[Math.floor(o.length / 2)].description } : {}),
        ...(o[o.length - 1].description ? { maxLabel: o[o.length - 1].description } : {}),
      }
    }
    case "rating": {
      const o = numericOptions(q)
      const contiguous = o.length > 1 && o.every((x, i) => i === 0 || x.value - o[i - 1].value === 1)
      if (contiguous && o.filter((x) => x.description).length <= 2) {
        return {
          ...base,
          type: "rating",
          min: o[0].value,
          max: o[o.length - 1].value,
          ...(o[0].description ? { minLabel: o[0].description } : {}),
          ...(o[o.length - 1].description ? { maxLabel: o[o.length - 1].description } : {}),
        }
      }
      // Ratings with a label on every point read better as a labelled scale.
      return {
        ...base,
        type: "likert",
        options: o.map((x) => ({ value: x.value, label: x.description || String(x.value) })),
      }
    }
    default:
      return undefined
  }
}

export interface LegacyConversion {
  survey: SurveyDefinition
  notes: string[]
}

export function convertLegacySurvey(settings: LegacyQuestion[], title?: string): LegacyConversion {
  const notes: string[] = []
  const questions: Question[] = []
  const alerts: AlertDefinition[] = []
  let n = 0
  const nextId = () => `q${++n}`

  const addWarnings = (lq: LegacyQuestion, key: string) => {
    for (const w of lq.warnings ?? []) {
      if (!w?.warningText) continue
      alerts.push({
        id: `alert_${alerts.length + 1}`,
        when: { question: key, op: "eq", value: cleanAnswer(w.answer) },
        message: w.warningText,
        severity: "warning",
        timing: "submit",
      })
    }
  }

  for (let i = 0; i < settings.length; i++) {
    const lq = settings[i] ?? {}
    const startsMatrix = settings[i + 1]?.type === "matrix" || (i === 0 && lq.type === "matrix")
    if (startsMatrix) {
      const group: LegacyQuestion[] = [lq]
      while (settings[i + 1]?.type === "matrix") group.push(settings[++i])
      const head = lq.type === "matrix" ? { ...lq, type: "text" } : lq
      const columns = matrixColumns(head)
      if (columns && columns.length > 0) {
        const id = nextId()
        const rows = group.map((g, k) => ({ id: `r${k + 1}`, text: g.text ?? "" }))
        questions.push({
          id,
          type: "matrix",
          text: head.description ?? "",
          required: group.some((g) => g.required),
          rows,
          options: columns,
        })
        group.forEach((g, k) => addWarnings(g, `${id}.${rows[k].id}`))
      } else {
        notes.push(`A "${head.type}" grid was split into separate questions (grids now support single-choice columns only).`)
        for (const g of group) {
          const q = convertOne({ ...g, type: head.type, options: head.options, description: g.description ?? null }, nextId())
          if (q) {
            questions.push(q)
            addWarnings(g, q.id)
          }
        }
      }
      continue
    }
    const id = nextId()
    const q = convertOne(lq, id)
    if (!q) {
      notes.push(`Skipped question ${i + 1} with unsupported type "${lq.type}".`)
      n--
      continue
    }
    questions.push(q)
    addWarnings(lq, id)
  }

  if (alerts.length) notes.push(`${alerts.length} dashboard warning(s) became in-survey alerts shown at submit.`)

  return {
    survey: {
      schemaVersion: SCHEMA_VERSION,
      ...(title ? { title } : {}),
      defaultLanguage: "en",
      languages: ["en"],
      options: { layout: "question" },
      questions,
      ...(alerts.length ? { alerts } : {}),
    },
    notes,
  }
}

export function looksLikeLegacySettings(settings: unknown): settings is LegacyQuestion[] {
  return Array.isArray(settings) && settings.every((s) => s && typeof s === "object" && "text" in s && "type" in s)
}
