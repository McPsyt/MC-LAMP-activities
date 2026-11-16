import * as React from "react"
import { RadioGroup as RadioGroupPrimitive, Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "../Markdown"
import { useRunner } from "../context"
import type { ChoiceOption } from "@/survey/schema"

export const optionKey = (v: unknown) => String(v)

const cardBase =
  "group/opt relative flex w-full min-h-12 cursor-pointer items-start gap-3 rounded-lg border bg-card px-3.5 py-3 text-left text-[0.95rem] leading-snug shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary/[0.06] dark:data-[state=checked]:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"

function OptionText({ option }: { option: ChoiceOption }) {
  const { text } = useRunner()
  const label = text(option.label) || String(option.value)
  const desc = text(option.description)
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
      <Markdown inline className="font-medium">
        {label}
      </Markdown>
      {desc ? (
        <Markdown inline className="text-sm text-muted-foreground">
          {desc}
        </Markdown>
      ) : null}
    </span>
  )
}

function RadioDot() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-background shadow-xs group-data-[state=checked]/opt:border-primary"
    >
      <span className="size-2.5 scale-0 rounded-full bg-primary transition-transform group-data-[state=checked]/opt:scale-100" />
    </span>
  )
}

function CheckBoxMark() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-input bg-background text-primary-foreground shadow-xs group-data-[state=checked]/opt:border-primary group-data-[state=checked]/opt:bg-primary"
    >
      <CheckIcon className="size-3.5 opacity-0 group-data-[state=checked]/opt:opacity-100" strokeWidth={3} />
    </span>
  )
}

/** Radio "cards": one per option, full width, large touch targets. */
export function RadioCards({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  columns,
  extra,
}: {
  options: ChoiceOption[]
  value: unknown
  onChange: (key: string) => void
  labelledBy: string
  describedBy?: string
  invalid: boolean
  columns?: 1 | 2
  extra?: React.ReactNode
}) {
  const selected = value === undefined || value === null ? "" : optionKey(value)
  return (
    <RadioGroupPrimitive.Root
      value={selected}
      onValueChange={onChange}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn("grid gap-2", columns === 2 && "grid-cols-2")}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item key={optionKey(o.value)} value={optionKey(o.value)} className={cardBase}>
          <RadioDot />
          <OptionText option={o} />
        </RadioGroupPrimitive.Item>
      ))}
      {extra}
    </RadioGroupPrimitive.Root>
  )
}

/** Checkbox "cards" for multiple choice. */
export function CheckCard({
  option,
  checked,
  onCheckedChange,
}: {
  option: ChoiceOption
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <CheckboxPrimitive.Root checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} className={cardBase}>
      <CheckBoxMark />
      <OptionText option={option} />
    </CheckboxPrimitive.Root>
  )
}
