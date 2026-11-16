import * as React from "react"
import { InfoIcon } from "lucide-react"
import type { LString } from "@/survey/schema"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useBuilder } from "./store"
import { getDefaultL, getL, setL } from "./lstring"

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
  tip,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  className?: string
  tip?: string
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor} className="text-[0.8rem] font-medium">
          {label}
        </Label>
        {tip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground" aria-label="More information">
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{tip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** The language currently being edited, and whether the survey is multilingual. */
export function useEditLanguage() {
  const editLang = useBuilder((s) => s.editLang)
  const defaultLang = useBuilder((s) => s.survey.defaultLanguage ?? "en")
  const multi = useBuilder((s) => (s.survey.languages?.length ?? 1) > 1)
  return { editLang, defaultLang, multi, translating: editLang !== defaultLang }
}

/** Text input bound to a translatable string in the language being edited. */
export function LText({
  value,
  onChange,
  multiline,
  rows = 2,
  placeholder,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: LString | undefined
  onChange: (v: LString) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
  id?: string
  className?: string
  "aria-label"?: string
}) {
  const { editLang, defaultLang, multi, translating } = useEditLanguage()
  const text = getL(value, editLang, defaultLang)
  const fallback = translating ? getDefaultL(value, defaultLang) : ""
  const ph = fallback ? `${fallback}` : placeholder
  const missing = translating && !text && !!fallback
  const common = {
    id,
    value: text,
    placeholder: ph,
    "aria-label": ariaLabel,
    "data-missing": missing || undefined,
    className: cn(missing && "border-dashed border-warning/70 bg-warning/5", className),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(setL(value, editLang, defaultLang, e.target.value, multi)),
  }
  return multiline ? <Textarea rows={rows} {...common} className={cn("min-h-0 resize-y", common.className)} /> : <Input {...common} />
}

export function NumberInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  allowEmpty = true,
  "aria-label": ariaLabel,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  id?: string
  placeholder?: string
  className?: string
  allowEmpty?: boolean
  "aria-label"?: string
}) {
  const [raw, setRaw] = React.useState(value === undefined ? "" : String(value))
  React.useEffect(() => {
    if (value === undefined ? raw !== "" : Number(raw) !== value) setRaw(value === undefined ? "" : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      value={raw}
      placeholder={placeholder}
      className={cn("tabular-nums", className)}
      onChange={(e) => {
        setRaw(e.target.value)
        const s = e.target.value.trim().replace(",", ".")
        if (s === "") {
          if (allowEmpty) onChange(undefined)
          return
        }
        const n = Number(s)
        if (Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  id,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  id: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ""))
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

export function fileSafeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "survey"
  )
}
