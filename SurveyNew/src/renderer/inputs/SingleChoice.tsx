import * as React from "react"
import type { BooleanQuestion, ChoiceOption, LikertQuestion, MultipleQuestion, SingleQuestion } from "@/survey/schema"
import { OTHER_VALUE } from "@/survey/schema"
import { otherKey } from "@/survey/values"
import { Input } from "@/components/ui/input"
import { useRunner } from "../context"
import { CheckCard, RadioCards, optionKey } from "./ChoiceCards"
import type { InputProps } from "./types"
import { useOrderedOptions } from "./useOrderedOptions"

function otherOption(
  q: SingleQuestion | MultipleQuestion,
  text: (s: SingleQuestion["otherLabel"]) => string,
  fallback: string,
): ChoiceOption | undefined {
  if (!q.allowOther) return undefined
  return { value: OTHER_VALUE, label: text(q.otherLabel) || fallback }
}

function OtherText({ id, show }: { id: string; show: boolean }) {
  const { answers, setAnswer, t } = useRunner()
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (show) ref.current?.focus({ preventScroll: true })
  }, [show])
  if (!show) return null
  const v = answers[otherKey(id)]
  return (
    <Input
      ref={ref}
      aria-label={t("otherPlaceholder")}
      placeholder={t("otherPlaceholder")}
      value={typeof v === "string" ? v : ""}
      maxLength={250}
      onChange={(e) => setAnswer(otherKey(id), e.target.value)}
      className="h-11"
    />
  )
}

export function SingleChoiceInput({
  q,
  value,
  onChange,
  invalid,
  labelledBy,
  describedBy,
}: InputProps<SingleQuestion | LikertQuestion | BooleanQuestion>) {
  const { text, t } = useRunner()
  const options = useOrderedOptions(q)
  const otherLabel = q.type === "single" || q.type === "dropdown" ? q.otherLabel : undefined
  const other = React.useMemo(
    () => (q.type === "single" || q.type === "dropdown" ? otherOption(q, text, t("other")) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, otherLabel, text, t],
  )
  const all = React.useMemo(() => (other ? [...options, other] : options), [options, other])
  const byKey = React.useMemo(() => new Map(all.map((o) => [optionKey(o.value), o.value])), [all])
  return (
    <div className="grid gap-2">
      <RadioCards
        options={all}
        value={value}
        onChange={(k) => onChange(byKey.get(k))}
        labelledBy={labelledBy}
        describedBy={describedBy}
        invalid={invalid}
        columns={q.type === "boolean" ? 2 : 1}
      />
      {other ? <OtherText id={q.id} show={value === OTHER_VALUE} /> : null}
    </div>
  )
}

export function MultipleChoiceInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<MultipleQuestion>) {
  const { t, text } = useRunner()
  const options = useOrderedOptions(q)
  const other = otherOption(q, text, t("other"))
  const all = other ? [...options, other] : options
  const selected = Array.isArray(value) ? value : []
  const isOn = (v: unknown) => selected.some((s) => optionKey(s) === optionKey(v))
  const exclusive = new Set(options.filter((o) => o.exclusive).map((o) => optionKey(o.value)))

  const toggle = (o: ChoiceOption, on: boolean) => {
    const k = optionKey(o.value)
    let next = selected.filter((s) => optionKey(s) !== k)
    if (on) {
      next = exclusive.has(k) ? [] : next.filter((s) => !exclusive.has(optionKey(s)))
      next.push(o.value)
    }
    // Keep the authored order in the stored value.
    const order = new Map(all.map((x, i) => [optionKey(x.value), i]))
    next.sort((a, b) => (order.get(optionKey(a)) ?? 0) - (order.get(optionKey(b)) ?? 0))
    onChange(next.length ? next : undefined)
  }

  const hint =
    q.minSelected && q.maxSelected
      ? t("selectBetween", { min: q.minSelected, max: q.maxSelected })
      : q.maxSelected
        ? t("selectUpTo", { n: q.maxSelected })
        : q.minSelected
          ? t("selectAtLeast", { n: q.minSelected })
          : t("selectAll")

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="grid gap-2"
    >
      <p className="text-sm text-muted-foreground">{hint}</p>
      {all.map((o) => (
        <CheckCard key={optionKey(o.value)} option={o} checked={isOn(o.value)} onCheckedChange={(c) => toggle(o, c)} />
      ))}
      {other ? <OtherText id={q.id} show={isOn(OTHER_VALUE)} /> : null}
    </div>
  )
}
