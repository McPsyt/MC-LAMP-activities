import type { Answers, NormalizedSurvey, Question, ScoreDefinition } from "./schema"
import { findOption } from "./options"
import { isAnswered, rowKey } from "./values"

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v)
  return null
}

/** Score contributed by one answer (option score, else numeric value). */
export function itemScore(q: Question, value: unknown): number | null {
  if (!isAnswered(value)) return null
  switch (q.type) {
    case "single":
    case "dropdown":
    case "likert":
    case "matrix":
    case "boolean": {
      const opt = findOption(q, value)
      return opt?.score ?? numeric(opt?.value ?? value)
    }
    case "multiple": {
      const list = Array.isArray(value) ? value : [value]
      let total = 0
      let any = false
      for (const v of list) {
        const opt = findOption(q, v)
        const s = opt?.score ?? numeric(v)
        if (s != null) {
          total += s
          any = true
        }
      }
      return any ? total : list.length
    }
    case "slider":
    case "vas":
    case "rating":
    case "faces":
    case "number":
    case "duration":
      return numeric(value)
    default:
      return null
  }
}

/** Expand a score's question references into (question, answer key) pairs. */
function scoreItems(def: ScoreDefinition, survey: NormalizedSurvey): Array<{ q: Question; key: string }> {
  const byId = new Map(survey.questions.map((q) => [q.id, q]))
  const out: Array<{ q: Question; key: string }> = []
  for (const ref of def.questions) {
    const q = byId.get(ref)
    if (q) {
      if (q.type === "matrix") q.rows.forEach((r) => out.push({ q, key: rowKey(q.id, r.id) }))
      else out.push({ q, key: q.id })
      continue
    }
    const [qid] = ref.split(".")
    const mq = byId.get(qid)
    if (mq?.type === "matrix") out.push({ q: mq, key: ref })
  }
  return out
}

export function computeScore(def: ScoreDefinition, survey: NormalizedSurvey, answers: Answers): number | null {
  const values = scoreItems(def, survey)
    .map(({ q, key }) => itemScore(q, answers[key]))
    .filter((s): s is number => s != null)
  if (def.method === "count") return values.length
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return def.method === "mean" ? Math.round((sum / values.length) * 1000) / 1000 : sum
}

export function computeScores(survey: NormalizedSurvey, answers: Answers): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const def of survey.scores) out[def.id] = computeScore(def, survey, answers)
  return out
}
