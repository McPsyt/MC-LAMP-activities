import * as React from "react"
import type { LongTextQuestion, NumberQuestion, ShortTextQuestion } from "@/survey/schema"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useRunner } from "../context"
import type { InputProps } from "./types"

function Counter({ length, max }: { length: number; max: number }) {
  const { t } = useRunner()
  const left = max - length
  if (left > Math.max(20, max * 0.2)) return null
  return (
    <p className={left < 0 ? "text-right text-xs text-destructive" : "text-right text-xs text-muted-foreground"} aria-live="polite">
      {t("charsLeft", { n: Math.max(0, left) })}
    </p>
  )
}

export function ShortTextInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<ShortTextQuestion>) {
  const { text, onEnter } = useRunner()
  const v = typeof value === "string" ? value : ""
  const max = q.maxLength ?? 250
  const type = q.inputMode === "email" ? "email" : q.inputMode === "tel" ? "tel" : q.inputMode === "url" ? "url" : "text"
  return (
    <div className="grid gap-1">
      <Input
        type={type}
        inputMode={q.inputMode}
        value={v}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            onEnter()
          }
        }}
        placeholder={text(q.placeholder)}
        maxLength={max}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className="h-12 text-base"
      />
      <Counter length={v.length} max={max} />
    </div>
  )
}

export function LongTextInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<LongTextQuestion>) {
  const { text } = useRunner()
  const v = typeof value === "string" ? value : ""
  const max = q.maxLength ?? 2000
  return (
    <div className="grid gap-1">
      <Textarea
        value={v}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        placeholder={text(q.placeholder)}
        maxLength={max}
        rows={q.rows ?? 5}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="min-h-32 text-base"
      />
      <Counter length={v.length} max={max} />
    </div>
  )
}

/** Parse "12", "12.5" or "12,5". Returns undefined for blank, NaN for junk. */
export function parseNumber(raw: string): number | undefined {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (s === "") return undefined
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN
  return Number(s)
}

export function NumberInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<NumberQuestion>) {
  const { text, onEnter } = useRunner()
  const [raw, setRaw] = React.useState(() => (value == null ? "" : String(value)))
  // Keep the text box in sync when the value is changed elsewhere (clear, resume).
  React.useEffect(() => {
    const parsed = parseNumber(raw)
    if (value == null && raw !== "" && !Number.isNaN(parsed)) setRaw("")
    else if (typeof value === "number" && parsed !== value) setRaw(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const unit = text(q.unit)
  const decimals = q.decimals ?? 0
  return (
    <div className="flex items-center gap-2">
      <Input
        type="text"
        inputMode={decimals > 0 || (q.min ?? 0) < 0 ? "decimal" : "numeric"}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          const n = parseNumber(e.target.value)
          // Unparseable text is kept as a string so validation can say "enter a valid number".
          onChange(n === undefined ? undefined : Number.isNaN(n) ? e.target.value : n)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            onEnter()
          }
        }}
        placeholder={text(q.placeholder)}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className="h-12 max-w-48 text-lg tabular-nums"
      />
      {unit ? <span className="text-base text-muted-foreground">{unit}</span> : null}
    </div>
  )
}
