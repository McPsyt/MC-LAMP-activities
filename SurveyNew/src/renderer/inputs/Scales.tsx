import type * as React from "react"
import { RadioGroup as RadioGroupPrimitive, Slider as SliderPrimitive } from "radix-ui"
import { AngryIcon, AnnoyedIcon, FrownIcon, LaughIcon, MehIcon, SmileIcon, SmilePlusIcon, type LucideIcon } from "lucide-react"
import type { FacesQuestion, RatingQuestion, SliderQuestion, VasQuestion } from "@/survey/schema"
import { faceCount, getOptions } from "@/survey/options"
import { cn } from "@/lib/utils"
import { Markdown } from "../Markdown"
import { useRunner } from "../context"
import { optionKey } from "./ChoiceCards"
import type { InputProps } from "./types"

function Anchors({ min, mid, max }: { min?: string; mid?: string; max?: string }) {
  if (!min && !mid && !max) return null
  return (
    <div className="grid grid-cols-3 gap-2 text-xs leading-tight text-muted-foreground sm:text-sm">
      <Markdown inline className="text-left">
        {min ?? ""}
      </Markdown>
      <Markdown inline className="text-center">
        {mid ?? ""}
      </Markdown>
      <Markdown inline className="text-right">
        {max ?? ""}
      </Markdown>
    </div>
  )
}

/** Numeric rating scale (NRS): a row of number buttons, e.g. 0-10. */
export function RatingInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<RatingQuestion>) {
  const { text } = useRunner()
  const options = getOptions(q)
  const many = options.length > 6
  return (
    <div className="grid gap-2">
      <RadioGroupPrimitive.Root
        value={value == null ? "" : optionKey(value)}
        onValueChange={(k) => onChange(Number(k))}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        orientation="horizontal"
        className={cn("grid gap-1.5", many ? "grid-cols-6 sm:grid-cols-11" : "auto-cols-fr grid-flow-col")}
        style={many ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <RadioGroupPrimitive.Item
            key={optionKey(o.value)}
            value={optionKey(o.value)}
            aria-label={String(o.value)}
            className="flex h-12 items-center justify-center rounded-md border bg-card text-base font-semibold tabular-nums shadow-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
          >
            {String(o.value)}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <Anchors min={text(q.minLabel)} max={text(q.maxLabel)} />
    </div>
  )
}

const FACE_ICONS: Record<3 | 5 | 7, LucideIcon[]> = {
  3: [FrownIcon, MehIcon, SmileIcon],
  5: [AngryIcon, FrownIcon, MehIcon, SmileIcon, LaughIcon],
  7: [AngryIcon, FrownIcon, AnnoyedIcon, MehIcon, SmileIcon, SmilePlusIcon, LaughIcon],
}

/** Faces scale (mood). Values 1 (worst) .. count (best). */
export function FacesInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<FacesQuestion>) {
  const { text, t } = useRunner()
  const n = faceCount(q)
  const options = getOptions(q, t)
  const icons = FACE_ICONS[n]
  const showLabels = q.showLabels !== false
  return (
    <RadioGroupPrimitive.Root
      value={value == null ? "" : optionKey(value)}
      onValueChange={(k) => onChange(Number(k))}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      orientation="horizontal"
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const Icon = icons[i]
        const label = text(o.label)
        return (
          <RadioGroupPrimitive.Item
            key={optionKey(o.value)}
            value={optionKey(o.value)}
            aria-label={label}
            className="group/face flex flex-col items-center gap-1.5 rounded-lg px-0.5 py-2 text-muted-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:text-primary"
          >
            <span className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs transition-all group-data-[state=checked]/face:scale-110 group-data-[state=checked]/face:border-primary group-data-[state=checked]/face:bg-primary group-data-[state=checked]/face:text-primary-foreground sm:size-14">
              <Icon className="size-7 sm:size-8" strokeWidth={1.75} />
            </span>
            {showLabels ? <span className="text-center text-[0.7rem] leading-tight font-medium sm:text-xs">{label}</span> : null}
          </RadioGroupPrimitive.Item>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}

function SliderBase({
  min,
  max,
  step,
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  thick,
  valueText,
}: {
  min: number
  max: number
  step: number
  value: number | undefined
  onChange: (v: number) => void
  labelledBy: string
  describedBy?: string
  invalid: boolean
  thick?: boolean
  valueText?: string
}) {
  const answered = value !== undefined
  const mid = Math.round((min + max) / 2 / step) * step
  // While unanswered the (hidden) thumb rests mid-scale. Radix only reports *changes*, so a first tap
  // that lands exactly on that value would be lost - record the tapped position ourselves.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (answered) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const raw = min + fraction * (max - min)
    const snapped = Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step))
    onChange(Number(snapped.toFixed(6)))
  }
  return (
    <SliderPrimitive.Root
      min={min}
      max={max}
      step={step}
      value={[answered ? value : mid]}
      onValueChange={(v) => onChange(v[0])}
      onPointerDownCapture={onPointerDownCapture}
      aria-invalid={invalid || undefined}
      data-answered={answered || undefined}
      data-slot="survey-slider"
      className="relative flex h-11 w-full touch-none items-center select-none"
    >
      <SliderPrimitive.Track
        className={cn("relative grow overflow-hidden rounded-full bg-muted", thick ? "h-3 border" : "h-2")}
      >
        {answered && !thick ? <SliderPrimitive.Range className="absolute h-full bg-primary" /> : null}
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-valuetext={valueText}
        className={cn(
          "block shrink-0 rounded-full border-2 border-primary bg-background shadow-md ring-ring/50 transition-[opacity,box-shadow] outline-none focus-visible:ring-4",
          thick ? "h-7 w-3 rounded-sm" : "size-6",
          !answered && "opacity-0",
        )}
      />
    </SliderPrimitive.Root>
  )
}

export function SliderInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<SliderQuestion>) {
  const { text, t } = useRunner()
  const step = q.step && q.step > 0 ? q.step : 1
  const num = typeof value === "number" ? value : undefined
  const unit = text(q.unit)
  const showValue = q.showValue !== false
  const ticks = q.showTicks && (q.max - q.min) / step <= 20
  const shown = num === undefined ? "" : `${Number(num.toFixed(4))}${unit ? ` ${unit}` : ""}`
  return (
    <div className="grid gap-1">
      <div className="flex h-8 items-end justify-center text-2xl font-semibold tabular-nums" aria-live="polite">
        {showValue && num !== undefined ? shown : <span className="text-sm font-normal text-muted-foreground">{t("sliderHint")}</span>}
      </div>
      <SliderBase
        min={q.min}
        max={q.max}
        step={step}
        value={num}
        onChange={(v) => onChange(v)}
        labelledBy={labelledBy}
        describedBy={describedBy}
        invalid={invalid}
        valueText={shown || undefined}
      />
      {ticks ? (
        <div className="flex justify-between px-2.5 text-xs text-muted-foreground tabular-nums" aria-hidden>
          {Array.from({ length: Math.round((q.max - q.min) / step) + 1 }, (_, i) => (
            <span key={i}>{Number((q.min + i * step).toFixed(4))}</span>
          ))}
        </div>
      ) : (
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
          <span>{q.min}</span>
          <span>{q.max}</span>
        </div>
      )}
      <Anchors min={text(q.minLabel)} mid={text(q.midLabel)} max={text(q.maxLabel)} />
    </div>
  )
}

/** Visual analogue scale: continuous 0-100 line, number hidden by default. */
export function VasInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<VasQuestion>) {
  const { text, t } = useRunner()
  const num = typeof value === "number" ? value : undefined
  return (
    <div className="grid gap-2">
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        {q.showValue && num !== undefined ? <span className="text-2xl font-semibold text-foreground">{num}</span> : t("vasHint")}
      </p>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-6 w-px bg-foreground/60" />
        <SliderBase
          min={0}
          max={100}
          step={1}
          value={num}
          onChange={(v) => onChange(v)}
          labelledBy={labelledBy}
          describedBy={describedBy}
          invalid={invalid}
          thick
        />
        <span aria-hidden className="h-6 w-px bg-foreground/60" />
      </div>
      <div className="flex justify-between gap-6 text-sm font-medium">
        <Markdown inline className="max-w-[45%] text-left">
          {text(q.minLabel)}
        </Markdown>
        <Markdown inline className="max-w-[45%] text-right">
          {text(q.maxLabel)}
        </Markdown>
      </div>
    </div>
  )
}

export { Anchors }
