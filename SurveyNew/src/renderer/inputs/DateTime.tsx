import * as React from "react"
import { CalendarIcon, ClockIcon } from "lucide-react"
import type { DateQuestion, DateTimeQuestion, DurationQuestion, TimeQuestion } from "@/survey/schema"
import {
  combineDateTime,
  formatDateForDisplay,
  formatTime24,
  formatTimeForDisplay,
  parseIsoDate,
  parseTime,
  pad2,
  resolveDateBound,
  splitDateTime,
  toIsoDate,
} from "@/survey/dates"
import { intlLocale, weekStartsOn } from "@/survey/i18n"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useRunner } from "../context"
import type { InputProps } from "./types"

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  labelledBy,
  describedBy,
  invalid,
}: {
  value: string | undefined
  onChange: (iso: string | undefined) => void
  minDate?: string
  maxDate?: string
  labelledBy: string
  describedBy?: string
  invalid: boolean
}) {
  const { language, t, now } = useRunner()
  const [open, setOpen] = React.useState(false)
  const today = now()
  const min = parseIsoDate(resolveDateBound(minDate, today))
  const max = parseIsoDate(resolveDateBound(maxDate, today))
  const selected = parseIsoDate(value)
  const locale = intlLocale(language)
  const fmt = (opts: Intl.DateTimeFormatOptions) => (d: Date) => new Intl.DateTimeFormat(locale, opts).format(d)
  const startMonth = min ?? new Date(today.getFullYear() - 100, 0, 1)
  const endMonth = max ?? new Date(today.getFullYear() + 10, 11, 31)
  const valueId = React.useId()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-labelledby={`${labelledBy} ${valueId}`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn("h-12 w-full justify-start gap-2 text-base font-normal sm:w-72", !selected && "text-muted-foreground")}
        >
          <CalendarIcon className="size-4" />
          <span id={valueId}>{value ? formatDateForDisplay(value, language) : t("pickDate")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (max && max < today ? max : today)}
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          weekStartsOn={weekStartsOn(language)}
          disabled={[...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])]}
          formatters={{
            formatMonthDropdown: fmt({ month: "short" }),
            formatCaption: fmt({ month: "long", year: "numeric" }),
            formatWeekdayName: fmt({ weekday: "narrow" }),
          }}
          onSelect={(d) => {
            onChange(d ? toIsoDate(d) : undefined)
            if (d) setOpen(false)
          }}
        />
        <div className="flex justify-end border-t p-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(toIsoDate(today))
              setOpen(false)
            }}
            disabled={(!!min && toIsoDate(today) < toIsoDate(min)) || (!!max && toIsoDate(today) > toIsoDate(max))}
          >
            {t("today")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DateInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<DateQuestion>) {
  return (
    <DatePicker
      value={typeof value === "string" ? value : undefined}
      onChange={onChange}
      minDate={q.minDate}
      maxDate={q.maxDate}
      labelledBy={labelledBy}
      describedBy={describedBy}
      invalid={invalid}
    />
  )
}

// ---------------------------------------------------------------------------
// Time: three tappable columns (hour, minute, AM/PM). Nothing is pre-selected.
// ---------------------------------------------------------------------------

function Column<T extends string | number>({
  label,
  items,
  selected,
  onSelect,
  render,
}: {
  label: string
  items: T[]
  selected: T | undefined
  onSelect: (v: T) => void
  render: (v: T) => string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[aria-checked=true]")
    el?.scrollIntoView?.({ block: "center" })
  }, [selected])
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className="h-44 flex-1 overflow-y-auto overscroll-contain rounded-md border bg-card p-1 [scrollbar-width:thin]">
      {items.map((v) => {
        const on = selected === v
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(v)}
            className={cn(
              "flex h-10 w-full items-center justify-center rounded text-base tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              on ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {render(v)}
          </button>
        )
      })}
    </div>
  )
}

function TimePicker({
  value,
  onChange,
  format,
  minuteStep,
  labelledBy,
  describedBy,
  invalid,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  format: "12h" | "24h"
  minuteStep: number
  labelledBy: string
  describedBy?: string
  invalid: boolean
}) {
  const { t, language, now } = useRunner()
  const parsed = parseTime(value)
  const [draft, setDraft] = React.useState<{ h?: number; m?: number; pm?: boolean }>(() =>
    parsed ? { h: parsed.h, m: parsed.m, pm: parsed.h >= 12 } : {},
  )
  React.useEffect(() => {
    if (parsed) setDraft({ h: parsed.h, m: parsed.m, pm: parsed.h >= 12 })
    else if (value == null) setDraft({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const step = Math.min(30, Math.max(1, minuteStep || 5))
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step)
  const is12 = format === "12h"
  const hours = is12 ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i)

  const commit = (next: { h?: number; m?: number; pm?: boolean }) => {
    setDraft(next)
    if (next.h === undefined) return
    const m = next.m ?? 0
    onChange(formatTime24(next.h, m))
  }
  const hour12 = draft.h === undefined ? undefined : draft.h % 12 === 0 ? 12 : draft.h % 12
  const pickHour = (h: number) => {
    const pm = draft.pm ?? now().getHours() >= 12
    const h24 = is12 ? (h % 12) + (pm ? 12 : 0) : h
    commit({ ...draft, h: h24, pm })
  }
  const pickPeriod = (pm: boolean) => {
    if (draft.h === undefined) return setDraft({ ...draft, pm })
    commit({ ...draft, pm, h: (draft.h % 12) + (pm ? 12 : 0) })
  }
  const setNow = () => {
    const d = now()
    const m = Math.min(59, Math.round(d.getMinutes() / step) * step)
    commit({ h: d.getHours(), m: m === 60 ? 0 : m, pm: d.getHours() >= 12 })
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="grid gap-2 sm:max-w-80"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums" aria-live="polite">
          <ClockIcon className="size-5 text-muted-foreground" />
          {value ? formatTimeForDisplay(value, format, language) : <span className="text-base font-normal text-muted-foreground">{t("pickTime")}</span>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={setNow}>
          {t("now")}
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Column label={t("hours")} items={hours} selected={is12 ? hour12 : draft.h} onSelect={pickHour} render={(h) => (is12 ? String(h) : pad2(h))} />
        <Column label={t("minutes")} items={minutes} selected={draft.m ?? (draft.h !== undefined ? 0 : undefined)} onSelect={(m) => commit({ ...draft, m, h: draft.h ?? (is12 ? (draft.pm ? 12 : 0) : 0) })} render={pad2} />
        {is12 ? (
          <Column
            label="AM/PM"
            items={["am", "pm"] as const as unknown as string[]}
            selected={draft.pm === undefined ? undefined : draft.pm ? "pm" : "am"}
            onSelect={(p) => pickPeriod(p === "pm")}
            render={(p) => (p === "pm" ? t("pm") : t("am"))}
          />
        ) : null}
      </div>
    </div>
  )
}

export function TimeInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<TimeQuestion>) {
  return (
    <TimePicker
      value={typeof value === "string" ? value : undefined}
      onChange={onChange}
      format={q.format ?? "12h"}
      minuteStep={q.minuteStep ?? 5}
      labelledBy={labelledBy}
      describedBy={describedBy}
      invalid={invalid}
    />
  )
}

export function DateTimeInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<DateTimeQuestion>) {
  const initial = splitDateTime(value)
  const [date, setDate] = React.useState<string | undefined>(initial.date)
  const [time, setTime] = React.useState<string | undefined>(initial.time)
  React.useEffect(() => {
    if (value == null) {
      // cleared from outside
      if (date && time) {
        setDate(undefined)
        setTime(undefined)
      }
      return
    }
    const s = splitDateTime(value)
    setDate(s.date)
    setTime(s.time)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const update = (d: string | undefined, tm: string | undefined) => {
    setDate(d)
    setTime(tm)
    onChange(d && tm ? combineDateTime(d, tm) : undefined)
  }
  return (
    <div className="grid gap-3">
      <DatePicker
        value={date}
        onChange={(d) => update(d, time)}
        minDate={q.minDate}
        maxDate={q.maxDate}
        labelledBy={labelledBy}
        describedBy={describedBy}
        invalid={invalid && !date}
      />
      <TimePicker
        value={time}
        onChange={(tm) => update(date, tm)}
        format={q.format ?? "12h"}
        minuteStep={q.minuteStep ?? 5}
        labelledBy={labelledBy}
        describedBy={describedBy}
        invalid={invalid && !time}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Duration (hours + minutes) -> total minutes
// ---------------------------------------------------------------------------

function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string
  value: number | undefined
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  suffix: string
}) {
  const v = value ?? 0
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="size-11 text-lg" aria-label={`${label} -`} onClick={() => onChange(clamp(v - step))}>
          -
        </Button>
        <Input
          aria-label={label}
          inputMode="numeric"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""))
            onChange(clamp(Number.isFinite(n) ? n : 0))
          }}
          className="h-11 w-16 text-center text-lg tabular-nums"
        />
        <Button type="button" variant="outline" size="icon" className="size-11 text-lg" aria-label={`${label} +`} onClick={() => onChange(clamp(v + step))}>
          +
        </Button>
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )
}

export function DurationInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<DurationQuestion>) {
  const { t } = useRunner()
  const total = typeof value === "number" ? value : undefined
  const maxH = q.maxHours ?? 24
  const step = q.minuteStep ?? 5
  const h = total === undefined ? undefined : Math.floor(total / 60)
  const m = total === undefined ? undefined : total % 60
  const set = (nh: number, nm: number) => onChange(Math.min(maxH * 60, nh * 60 + nm))
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-4"
    >
      <Stepper label={t("hours")} value={h} min={0} max={maxH} step={1} onChange={(nh) => set(nh, m ?? 0)} suffix={t("hoursShort")} />
      <Stepper label={t("minutes")} value={m} min={0} max={59} step={step} onChange={(nm) => set(h ?? 0, nm)} suffix={t("minutesShort")} />
    </div>
  )
}
