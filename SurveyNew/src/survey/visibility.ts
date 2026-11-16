import type { Answers, NormalizedSurvey } from "./schema"
import { isDisplayItem } from "./schema"
import { evaluate } from "./conditions"
import { computeScores } from "./scoring"
import { answerKeys } from "./values"

export interface VisibilityState {
  /** Ids of items (questions + display items) currently shown. */
  visible: Set<string>
  /** Answers of visible questions only (hidden answers are treated as unanswered). */
  effective: Answers
  /** Scores computed from effective answers. */
  scores: Record<string, number | null>
  /** Id of the question whose endSurveyIf ended the survey. */
  terminatedAt?: string
}

/**
 * Walk the survey in order. A question is visible when its showIf holds against the
 * answers of *earlier visible* questions, so hiding cascades to dependants.
 */
export function computeVisibility(survey: NormalizedSurvey, answers: Answers): VisibilityState {
  const visible = new Set<string>()
  const effective: Answers = {}
  let terminatedAt: string | undefined
  const usesScores = survey.scores.length > 0

  for (const q of survey.questions) {
    if (terminatedAt) break
    const ctx = { answers: effective, scores: usesScores ? computeScores(survey, effective) : {} }
    if (!evaluate(q.showIf, ctx)) continue
    visible.add(q.id)
    if (isDisplayItem(q)) continue
    for (const k of answerKeys(q)) if (answers[k] !== undefined) effective[k] = answers[k]
    if (q.endSurveyIf) {
      const after = { answers: effective, scores: usesScores ? computeScores(survey, effective) : {} }
      if (evaluate(q.endSurveyIf, after)) terminatedAt = q.id
    }
  }
  return { visible, effective, scores: usesScores ? computeScores(survey, effective) : {}, terminatedAt }
}
