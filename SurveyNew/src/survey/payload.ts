import type {
  ActivityResult,
  AnswerValue,
  Answers,
  NormalizedSurvey,
  OptionValue,
  TemporalSlice,
} from "./schema"
import { SCHEMA_VERSION, isDisplayItem } from "./schema"
import { resolveText } from "./i18n"
import { evaluate } from "./conditions"
import { hasOther } from "./options"
import { computeVisibility } from "./visibility"
import { answerKeys, isAnswered, otherKey, otherSelected, outputValue, rowKey } from "./values"

export interface BuildResultInput {
  survey: NormalizedSurvey
  answers: Answers
  /** Active milliseconds per question id. */
  durations: Record<string, number>
  startTime: number
  now: number
  language: string
  optionOrder: Record<string, OptionValue[]>
  resumed: boolean
}

const slice = (item: string, value: AnswerValue, duration: number): TemporalSlice => ({
  item,
  value,
  type: null,
  level: null,
  duration: Math.max(0, Math.round(duration)),
})

/**
 * Build the result posted to the parent app.
 * - One slice per answerable item in definition order (matrix rows expanded, plus an "(Other)" slice
 *   for questions with an Other option), so every response to a survey version has the same shape.
 * - `item` is the default-language, un-piped text: dashboards match slices by item text.
 * - Hidden (skipped) and unanswered items have value null.
 */
export function buildResult(input: BuildResultInput): ActivityResult {
  const { survey, answers, durations, startTime, now, language, optionOrder, resumed } = input
  const vis = computeVisibility(survey, answers)
  const lang = survey.defaultLanguage
  const text = (s: Parameters<typeof resolveText>[0]) => resolveText(s, lang, lang)

  const slices: TemporalSlice[] = []
  const staticAnswers: Record<string, AnswerValue> = {}
  const skipped: string[] = []

  for (const q of survey.questions) {
    if (isDisplayItem(q)) continue
    const shown = vis.visible.has(q.id)
    if (!shown) skipped.push(q.id)
    const d = shown ? (durations[q.id] ?? 0) : 0
    const val = (key: string): AnswerValue => (shown ? outputValue(vis.effective[key] ?? null) : null)

    if (q.type === "matrix") {
      for (const r of q.rows) {
        const key = rowKey(q.id, r.id)
        const v = val(key)
        slices.push(slice(text(r.text), v, d))
        if (isAnswered(v)) staticAnswers[key] = v
      }
      continue
    }

    const v = val(q.id)
    slices.push(slice(text(q.text), v, d))
    if (isAnswered(v)) staticAnswers[q.id] = v

    if (hasOther(q)) {
      const ov = shown && otherSelected(q, vis.effective) ? val(otherKey(q.id)) : null
      slices.push(slice(`${text(q.text)} (Other)`, ov, 0))
      if (isAnswered(ov)) staticAnswers[otherKey(q.id)] = ov
    }
  }

  const ctx = { answers: vis.effective, scores: vis.scores }
  const alerts = survey.alerts.filter((a) => evaluate(a.when, ctx)).map((a) => a.id)

  const usedOrder: Record<string, OptionValue[]> = {}
  for (const [qid, order] of Object.entries(optionOrder)) if (vis.visible.has(qid)) usedOrder[qid] = order

  return {
    timestamp: startTime,
    duration: Math.max(0, now - startTime),
    static_data: {
      survey: {
        schema: SCHEMA_VERSION,
        ...(survey.id ? { id: survey.id } : {}),
        ...(survey.version ? { version: survey.version } : {}),
      },
      language,
      answers: staticAnswers,
      skipped,
      scores: vis.scores,
      alerts,
      option_order: usedOrder,
      ...(vis.terminatedAt ? { terminated_at: vis.terminatedAt } : {}),
      resumed,
    },
    temporal_slices: slices,
  }
}

/** Keys of all answerable inputs (for tests/builder summaries). */
export function allAnswerKeys(survey: NormalizedSurvey): string[] {
  return survey.questions.flatMap(answerKeys)
}
