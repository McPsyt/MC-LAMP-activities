import * as React from "react"
import type { AnswerValue, Answers, LString, NormalizedSurvey, OptionValue } from "@/survey/schema"
import type { Translator } from "@/survey/i18n"

export interface RunnerContextValue {
  survey: NormalizedSurvey
  language: string
  t: Translator
  /** Resolve translatable text for the participant's language and apply answer piping. */
  text: (s: LString | undefined | null) => string
  answers: Answers
  setAnswer: (key: string, value: AnswerValue | undefined) => void
  optionOrder: Record<string, OptionValue[]>
  /** Called when the participant presses Enter in a single-line input. */
  onEnter: () => void
  now: () => Date
}

export const RunnerContext = React.createContext<RunnerContextValue | null>(null)

export function useRunner(): RunnerContextValue {
  const ctx = React.useContext(RunnerContext)
  if (!ctx) throw new Error("useRunner must be used inside <SurveyRunner>")
  return ctx
}
