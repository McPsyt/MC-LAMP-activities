import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import type { ActivityResult, Question, SurveyDefinition } from "@/survey/schema"
import { SurveyRunner, type SurveyRunnerProps } from "@/renderer/SurveyRunner"
import { survey } from "../helpers"

export function renderSurvey(
  questions: Question[],
  extra: Partial<SurveyDefinition> = {},
  props: Partial<SurveyRunnerProps> = {},
) {
  const onSubmit = vi.fn<(r: ActivityResult) => void>()
  const onCancel = vi.fn()
  let t = 1_000_000
  const user = userEvent.setup()
  const utils = render(
    <SurveyRunner
      survey={survey(questions, extra)}
      title="Test_Survey"
      language="en-US"
      storageKey="surveynew-progress-test"
      onSubmit={onSubmit}
      onCancel={onCancel}
      clock={() => (t += 1000)}
      seed={7}
      {...props}
    />,
  )
  return { ...utils, user, onSubmit, onCancel, result: () => onSubmit.mock.calls[0]?.[0] }
}
