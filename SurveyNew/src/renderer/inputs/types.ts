import type { AnswerValue, Question } from "@/survey/schema"

export interface InputProps<Q extends Question = Question> {
  q: Q
  value: AnswerValue | undefined
  onChange: (value: AnswerValue | undefined) => void
  invalid: boolean
  /** id of the element labelling this input (the question heading). */
  labelledBy: string
  /** id of the error/hint text. */
  describedBy?: string
}
