import type { Answers, NormalizedSurvey } from "@/survey/schema"
import { hashJson } from "@/survey/hash"

/** Saved, unfinished response (resume). Lives in the shared localStorage of the dashboard origin. */
export interface SavedProgress {
  v: 1
  hash: string
  savedAt: number
  startTime: number
  seed: number
  answers: Answers
  pageKey: string | null
  durations: Record<string, number>
}

export const progressKey = (activityId: string) => `surveynew-progress-${activityId}`

/** localStorage, or null when unavailable (private mode, sandbox without same-origin). */
export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage
    const k = "__surveynew_probe__"
    s.setItem(k, "1")
    s.removeItem(k)
    return s
  } catch {
    return null
  }
}

/** Hash of the parts of a survey that make saved answers incompatible when changed. */
export function surveyShapeHash(survey: NormalizedSurvey): string {
  return hashJson(survey.questions.map((q) => [q.id, q.type, q.type === "matrix" ? q.rows.map((r) => r.id) : null]))
}

export function loadProgress(
  storage: Storage | null,
  key: string | null | undefined,
  survey: NormalizedSurvey,
  now: number,
): SavedProgress | null {
  if (!storage || !key || !survey.options.resume.enabled) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as SavedProgress
    const maxAge = Math.max(0.01, survey.options.resume.expiresAfterHours) * 3_600_000
    if (p?.v !== 1 || p.hash !== surveyShapeHash(survey) || now - p.savedAt > maxAge) {
      storage.removeItem(key)
      return null
    }
    if (!p.answers || Object.keys(p.answers).length === 0) return null
    return p
  } catch {
    return null
  }
}

export function saveProgress(storage: Storage | null, key: string | null | undefined, p: SavedProgress) {
  if (!storage || !key) return
  try {
    storage.setItem(key, JSON.stringify(p))
  } catch {
    /* quota or access errors: resume is best-effort */
  }
}

export function clearProgress(storage: Storage | null, key: string | null | undefined) {
  if (!storage || !key) return
  try {
    storage.removeItem(key)
  } catch {
    /* ignore */
  }
}
