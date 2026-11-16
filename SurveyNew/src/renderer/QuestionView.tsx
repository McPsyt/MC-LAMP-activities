import * as React from "react"
import { AlertCircleIcon } from "lucide-react"
import type { AnswerValue, Question } from "@/survey/schema"
import { isDisplayItem, isRequired } from "@/survey/schema"
import { answerKeys, questionTouched } from "@/survey/values"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Markdown } from "./Markdown"
import { useRunner } from "./context"
import { SingleChoiceInput, MultipleChoiceInput } from "./inputs/SingleChoice"
import { DropdownInput } from "./inputs/Dropdown"
import { FacesInput, RatingInput, SliderInput, VasInput } from "./inputs/Scales"
import { MatrixInput } from "./inputs/Matrix"
import { RankingInput } from "./inputs/Ranking"
import { LongTextInput, NumberInput, ShortTextInput } from "./inputs/TextInputs"
import { DateInput, DateTimeInput, DurationInput, TimeInput } from "./inputs/DateTime"
import type { InputProps } from "./inputs/types"

function renderInput(props: InputProps): React.ReactNode {
  const q = props.q
  switch (q.type) {
    case "single":
    case "likert":
    case "boolean":
      return <SingleChoiceInput {...props} q={q} />
    case "dropdown":
      return <DropdownInput {...props} q={q} />
    case "multiple":
      return <MultipleChoiceInput {...props} q={q} />
    case "matrix":
      return <MatrixInput {...props} q={q} />
    case "ranking":
      return <RankingInput {...props} q={q} />
    case "slider":
      return <SliderInput {...props} q={q} />
    case "vas":
      return <VasInput {...props} q={q} />
    case "rating":
      return <RatingInput {...props} q={q} />
    case "faces":
      return <FacesInput {...props} q={q} />
    case "number":
      return <NumberInput {...props} q={q} />
    case "short":
      return <ShortTextInput {...props} q={q} />
    case "text":
      return <LongTextInput {...props} q={q} />
    case "date":
      return <DateInput {...props} q={q} />
    case "time":
      return <TimeInput {...props} q={q} />
    case "datetime":
      return <DateTimeInput {...props} q={q} />
    case "duration":
      return <DurationInput {...props} q={q} />
    default:
      return null
  }
}

export interface QuestionViewProps {
  q: Question
  number?: number
  error?: string | null
  /** Focus the heading when the question becomes the first on a new screen. */
  autoFocus?: boolean
  /** Single question on its own screen: larger heading. */
  solo?: boolean
}

export function QuestionView({ q, number, error, autoFocus, solo }: QuestionViewProps) {
  const { text, t, answers, setAnswer } = useRunner()
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  React.useEffect(() => {
    if (autoFocus) headingRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const labelId = `q-${q.id}-label`
  const errorId = `q-${q.id}-error`
  const descId = `q-${q.id}-desc`

  if (q.type === "section") {
    return (
      <header className="grid gap-1.5 pb-1">
        <h2 ref={headingRef} tabIndex={-1} id={labelId} className="text-2xl font-semibold tracking-tight outline-none">
          <Markdown inline>{text(q.text)}</Markdown>
        </h2>
        {q.description ? <Markdown className="text-muted-foreground">{text(q.description)}</Markdown> : null}
      </header>
    )
  }

  if (q.type === "info") {
    return (
      <section className="rounded-xl border bg-muted/40 p-4 text-[0.95rem] leading-relaxed" aria-labelledby={labelId}>
        <div ref={headingRef} tabIndex={-1} id={labelId} className="outline-none">
          <Markdown>{text(q.text)}</Markdown>
        </div>
        {q.description ? <Markdown className="mt-2 text-sm text-muted-foreground">{text(q.description)}</Markdown> : null}
      </section>
    )
  }

  const required = isRequired(q)
  const value = answers[q.id]
  const touched = questionTouched(q, answers)
  const onChange = (v: AnswerValue | undefined) => setAnswer(q.id, v)
  const clear = () => answerKeys(q).forEach((k) => setAnswer(k, undefined))
  const describedBy = [q.description ? descId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <section
      data-question={q.id}
      data-invalid={error ? true : undefined}
      aria-labelledby={labelId}
      className={cn("grid gap-3 scroll-mt-4 rounded-xl transition-colors", error && "ring-destructive/0")}
    >
      <div className="grid gap-1.5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          id={labelId}
          className={cn("font-semibold tracking-tight outline-none", solo ? "text-xl leading-snug sm:text-2xl" : "text-lg leading-snug")}
        >
          {number ? <span className="mr-1.5 text-muted-foreground tabular-nums">{number}.</span> : null}
          <Markdown inline>{text(q.text)}</Markdown>
          {!required ? (
            <Badge variant="secondary" className="ml-2 align-middle font-normal">
              {t("optional")}
            </Badge>
          ) : null}
        </h2>
        {q.description ? (
          <div id={descId}>
            <Markdown className="text-[0.95rem] text-muted-foreground">{text(q.description)}</Markdown>
          </div>
        ) : null}
      </div>

      {renderInput({ q, value, onChange, invalid: !!error, labelledBy: labelId, describedBy })}

      <div className="flex min-h-5 items-start justify-between gap-2">
        {error ? (
          <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertCircleIcon className="size-4 shrink-0" />
            {error}
          </p>
        ) : (
          <span />
        )}
        {!required && touched && !isDisplayItem(q) ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={clear}>
            {t("clearAnswer")}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
