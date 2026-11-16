import type { Question, SurveyDefinition } from "@/survey/schema"
import { normalizeSurvey } from "@/survey/normalize"

export function survey(questions: Question[], extra: Partial<SurveyDefinition> = {}) {
  return normalizeSurvey({ schemaVersion: 1, questions, ...extra })
}

export const medication: Question[] = [
  { id: "dose_taken", type: "boolean", text: "Did you already take your first dose of medication?" },
  {
    id: "dose_time",
    type: "time",
    text: "At what time?",
    showIf: { question: "dose_taken", op: "eq", value: "Yes" },
  },
]
