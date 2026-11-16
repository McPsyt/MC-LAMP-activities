import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { ChoiceOption, MatrixRow } from "@/survey/schema"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { LText, NumberInput, useEditLanguage } from "./ui"
import { getDefaultL, slugId, uniqueId } from "./lstring"

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}

/**
 * Edit answer options. `numeric` = scale values (numbers); otherwise values are short codes
 * derived from the label until edited by hand.
 */
export function OptionsEditor({
  options,
  onChange,
  numeric = false,
  showExclusive = false,
  showScore = true,
  showDescription = true,
}: {
  options: ChoiceOption[]
  onChange: (o: ChoiceOption[]) => void
  numeric?: boolean
  showExclusive?: boolean
  showScore?: boolean
  showDescription?: boolean
}) {
  const { defaultLang, translating } = useEditLanguage()
  const set = (i: number, patch: Partial<ChoiceOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)))

  const add = () => {
    if (numeric) {
      const max = options.reduce((m, o) => Math.max(m, Number(o.value) || 0), -1)
      onChange([...options, { value: max + 1, label: `Point ${max + 2}` }])
    } else {
      const taken = new Set(options.map((o) => String(o.value)))
      const n = options.length + 1
      onChange([...options, { value: uniqueId(`option_${n}`, taken), label: `Option ${n}` }])
    }
  }

  const onLabel = (i: number, label: ChoiceOption["label"]) => {
    const o = options[i]
    const prevLabel = getDefaultL(o.label, defaultLang)
    const auto = !numeric && !translating && (String(o.value) === slugId(prevLabel, "option") || /^option_\d+(_\d+)?$/.test(String(o.value)))
    const nextLabel = getDefaultL(label, defaultLang)
    if (auto && nextLabel) {
      const taken = new Set(options.filter((_, j) => j !== i).map((x) => String(x.value)))
      set(i, { label, value: uniqueId(slugId(nextLabel, "option"), taken) })
    } else set(i, { label })
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_7rem_auto] gap-2 px-1 text-xs font-medium text-muted-foreground">
        <span>Answer shown</span>
        <span title="What gets saved in the results">Saved as</span>
        <span className="w-[5.5rem]" />
      </div>
      {options.map((o, i) => (
        <div key={i} className="grid gap-1.5 rounded-lg border p-2" data-testid="option-row">
          <div className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
            <LText aria-label={`Option ${i + 1} label`} value={o.label} onChange={(l) => onLabel(i, l)} placeholder={String(o.value)} />
            {numeric ? (
              <NumberInput aria-label={`Option ${i + 1} value`} value={typeof o.value === "number" ? o.value : Number(o.value)} onChange={(n) => set(i, { value: n ?? 0 })} allowEmpty={false} />
            ) : (
              <Input
                aria-label={`Option ${i + 1} value`}
                value={String(o.value)}
                className="font-mono text-xs"
                onChange={(e) => set(i, { value: e.target.value })}
              />
            )}
            <div className="flex">
              <Button variant="ghost" size="icon" className="size-8" aria-label="Move up" disabled={i === 0} onClick={() => onChange(move(options, i, i - 1))}>
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Move down" disabled={i === options.length - 1} onClick={() => onChange(move(options, i, i + 1))}>
                <ArrowDownIcon />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove option ${i + 1}`} onClick={() => onChange(options.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
          </div>
          {showDescription || showScore || showExclusive ? (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {showDescription ? (
                <div className="min-w-48 flex-1">
                  <LText aria-label={`Option ${i + 1} description`} value={o.description} onChange={(d) => set(i, { description: d || undefined })} placeholder="Description (optional)" className="h-8 text-xs" />
                </div>
              ) : null}
              {showScore && !numeric ? (
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  Score
                  <NumberInput aria-label={`Option ${i + 1} score`} className="h-8 w-16 text-xs" value={o.score} onChange={(n) => set(i, { score: n })} />
                </label>
              ) : null}
              {showExclusive ? (
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <Checkbox checked={!!o.exclusive} onCheckedChange={(c) => set(i, { exclusive: c === true || undefined })} />
                  Clears other choices
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={add} disabled={translating}>
        <PlusIcon /> Add option
      </Button>
    </div>
  )
}

export function RowsEditor({ rows, onChange }: { rows: MatrixRow[]; onChange: (r: MatrixRow[]) => void }) {
  const { translating } = useEditLanguage()
  const add = () => {
    const taken = new Set(rows.map((r) => r.id))
    let n = rows.length + 1
    while (taken.has(`r${n}`)) n++
    onChange([...rows, { id: `r${n}`, text: `Item ${rows.length + 1}` }])
  }
  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={r.id + i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2" data-testid="row-row">
          <LText aria-label={`Row ${i + 1} text`} value={r.text} onChange={(t) => onChange(rows.map((x, j) => (j === i ? { ...x, text: t } : x)))} />
          <Input aria-label={`Row ${i + 1} id`} value={r.id} className="font-mono text-xs" onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} />
          <div className="flex">
            <Button variant="ghost" size="icon" className="size-8" aria-label="Move up" disabled={i === 0} onClick={() => onChange(move(rows, i, i - 1))}>
              <ArrowUpIcon />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => onChange(move(rows, i, i + 1))}>
              <ArrowDownIcon />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={add} disabled={translating}>
        <PlusIcon /> Add row
      </Button>
    </div>
  )
}
