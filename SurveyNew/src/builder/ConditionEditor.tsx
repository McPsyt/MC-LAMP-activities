import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import type { Condition, Operator, QuestionRule, ScoreRule } from "@/survey/schema"
import { isQuestionRule, isScoreRule } from "@/survey/conditions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NumberInput } from "./ui"
import { needsValue, operatorLabel, operatorsFor, optionLabel, type Subject } from "./subjects"

type Rule = QuestionRule | ScoreRule

interface Editable {
  mode: "all" | "any"
  rules: Rule[]
}

function toEditable(c: Condition | undefined): Editable | null {
  if (!c) return { mode: "all", rules: [] }
  if (isQuestionRule(c) || isScoreRule(c)) return { mode: "all", rules: [c] }
  if ("all" in c && c.all.every((r) => isQuestionRule(r) || isScoreRule(r))) return { mode: "all", rules: c.all as Rule[] }
  if ("any" in c && c.any.every((r) => isQuestionRule(r) || isScoreRule(r))) return { mode: "any", rules: c.any as Rule[] }
  return null // nested logic: edit as JSON
}

function fromEditable(e: Editable): Condition | undefined {
  if (e.rules.length === 0) return undefined
  if (e.rules.length === 1) return e.rules[0]
  return e.mode === "all" ? { all: e.rules } : { any: e.rules }
}

const subjectKey = (r: Rule) => (isScoreRule(r) ? `score:${r.score}` : r.question)

function ValueEditor({ rule, subject, onChange, lang }: { rule: Rule; subject?: Subject; onChange: (v: unknown) => void; lang: string }) {
  if (!subject || !needsValue(rule.op)) return null
  const multiValue = rule.op === "in" || rule.op === "notIn"
  if (subject.options && subject.options.length && (subject.kind === "choice" || subject.kind === "multi")) {
    if (multiValue) {
      const selected = Array.isArray(rule.value) ? rule.value.map(String) : rule.value === undefined ? [] : [String(rule.value)]
      const toggle = (v: string, on: boolean) => {
        const next = on ? [...selected, v] : selected.filter((x) => x !== v)
        onChange(subject.options!.filter((o) => next.includes(String(o.value))).map((o) => o.value))
      }
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 min-w-36 justify-start truncate font-normal">
              {selected.length ? `${selected.length} selected` : "Choose answers"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="grid max-h-72 w-64 gap-1 overflow-y-auto p-2" align="start">
            {subject.options.map((o) => {
              const v = String(o.value)
              return (
                <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                  <Checkbox checked={selected.includes(v)} onCheckedChange={(c) => toggle(v, c === true)} />
                  {optionLabel(o, lang)}
                </label>
              )
            })}
          </PopoverContent>
        </Popover>
      )
    }
    const current = rule.value === undefined ? "" : String(rule.value)
    return (
      <Select value={current} onValueChange={(v) => onChange(subject.options!.find((o) => String(o.value) === v)?.value ?? v)}>
        <SelectTrigger className="h-9 min-w-36" aria-label="Value">
          <SelectValue placeholder="Choose answer" />
        </SelectTrigger>
        <SelectContent>
          {subject.options.map((o) => (
            <SelectItem key={String(o.value)} value={String(o.value)}>
              {optionLabel(o, lang)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (subject.kind === "number" || subject.isScore) {
    return <NumberInput aria-label="Value" className="h-9 w-28" value={typeof rule.value === "number" ? rule.value : undefined} onChange={(n) => onChange(n)} />
  }
  if (subject.kind === "time") {
    return <Input aria-label="Value" type="time" className="h-9 w-32" value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value)} />
  }
  if (subject.kind === "date" || subject.kind === "datetime") {
    return <Input aria-label="Value" type="date" className="h-9 w-40" value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value)} />
  }
  return <Input aria-label="Value" className="h-9 w-40" value={String(rule.value ?? "")} onChange={(e) => onChange(e.target.value)} />
}

export function ConditionEditor({
  value,
  onChange,
  subjects,
  lang,
  emptyText = "Always",
  addLabel = "Add rule",
}: {
  value: Condition | undefined
  onChange: (c: Condition | undefined) => void
  subjects: Subject[]
  lang: string
  emptyText?: string
  addLabel?: string
}) {
  const editable = React.useMemo(() => toEditable(value), [value])
  const [json, setJson] = React.useState(() => JSON.stringify(value ?? null, null, 2))
  const [jsonError, setJsonError] = React.useState<string | null>(null)

  if (!editable) {
    return (
      <div className="grid gap-2">
        <p className="text-xs text-muted-foreground">This logic uses nested groups, so it is shown as JSON.</p>
        <Textarea
          className="font-mono text-xs"
          rows={8}
          value={json}
          onChange={(e) => {
            setJson(e.target.value)
            try {
              const parsed = JSON.parse(e.target.value)
              setJsonError(null)
              onChange(parsed ?? undefined)
            } catch {
              setJsonError("Not valid JSON yet.")
            }
          }}
        />
        {jsonError ? <p className="text-xs text-destructive">{jsonError}</p> : null}
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange(undefined)}>
          Clear logic
        </Button>
      </div>
    )
  }

  const bySubject = new Map(subjects.map((s) => [s.key, s]))
  const update = (rules: Rule[], mode = editable.mode) => onChange(fromEditable({ mode, rules }))
  const setRule = (i: number, r: Rule) => update(editable.rules.map((x, j) => (j === i ? r : x)))

  const pickSubject = (i: number, key: string) => {
    const s = bySubject.get(key)
    if (!s) return
    const ops = operatorsFor(s.kind, !!s.options?.length && s.options.every((o) => typeof o.value === "number"))
    const op: Operator = ops[0]
    const firstValue = s.options?.[0]?.value
    const r: Rule = s.isScore
      ? { score: key.slice("score:".length), op: "gte", value: 0 }
      : { question: key, op, ...(needsValue(op) && firstValue !== undefined && s.kind === "choice" ? { value: firstValue } : {}) }
    setRule(i, r)
  }

  const questionSubjects = subjects.filter((s) => !s.isScore)
  const scoreSubjects = subjects.filter((s) => s.isScore)

  return (
    <div className="grid gap-2">
      {editable.rules.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null}
      {editable.rules.length > 1 ? (
        <div className="flex items-center gap-2 text-sm">
          <span>Match</span>
          <Select value={editable.mode} onValueChange={(m) => update(editable.rules, m as "all" | "any")}>
            <SelectTrigger className="h-8 w-28" aria-label="Match all or any">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all rules</SelectItem>
              <SelectItem value="any">any rule</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {editable.rules.map((rule, i) => {
        const key = subjectKey(rule)
        const s = bySubject.get(key)
        const ops = s ? operatorsFor(s.kind, !!s.options?.length && s.options.every((o) => typeof o.value === "number")) : []
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 p-2" data-testid="rule">
            <Select value={s ? key : ""} onValueChange={(k) => pickSubject(i, k)}>
              <SelectTrigger className="h-9 max-w-full min-w-48 flex-1" aria-label="Question">
                <SelectValue placeholder={key ? `Missing: ${key}` : "Choose a question"} />
              </SelectTrigger>
              <SelectContent>
                {questionSubjects.length ? (
                  <SelectGroup>
                    <SelectLabel>Earlier questions</SelectLabel>
                    {questionSubjects.map((x) => (
                      <SelectItem key={x.key} value={x.key}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No earlier questions</div>
                )}
                {scoreSubjects.length ? (
                  <SelectGroup>
                    <SelectLabel>Scores</SelectLabel>
                    {scoreSubjects.map((x) => (
                      <SelectItem key={x.key} value={x.key}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            {s ? (
              <Select
                value={rule.op}
                onValueChange={(op) => {
                  const next = { ...rule, op: op as Operator }
                  if (!needsValue(op as Operator)) delete (next as { value?: unknown }).value
                  if ((op === "in" || op === "notIn") && !Array.isArray(rule.value)) (next as { value?: unknown }).value = rule.value === undefined ? [] : [rule.value]
                  if (!(op === "in" || op === "notIn") && Array.isArray(rule.value)) (next as { value?: unknown }).value = rule.value[0]
                  setRule(i, next as Rule)
                }}
              >
                <SelectTrigger className="h-9 w-40" aria-label="Operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ops.map((op) => (
                    <SelectItem key={op} value={op}>
                      {operatorLabel(op, s.kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <ValueEditor rule={rule} subject={s} lang={lang} onChange={(v) => setRule(i, { ...rule, value: v } as Rule)} />
            <Button variant="ghost" size="icon" className="ml-auto size-8" aria-label="Remove rule" onClick={() => update(editable.rules.filter((_, j) => j !== i))}>
              <Trash2Icon />
            </Button>
          </div>
        )
      })}
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={subjects.length === 0}
        onClick={() => update([...editable.rules, { question: "", op: "eq" }])}
      >
        <PlusIcon /> {addLabel}
      </Button>
      {subjects.length === 0 ? <p className="text-xs text-muted-foreground">Add questions before this one to use them in rules.</p> : null}
    </div>
  )
}
