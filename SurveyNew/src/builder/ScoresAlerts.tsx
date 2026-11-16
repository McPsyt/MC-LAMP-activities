import { PlusIcon, Trash2Icon } from "lucide-react"
import type { AlertDefinition, ScoreDefinition } from "@/survey/schema"
import { isDisplayItem } from "@/survey/schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useBuilder } from "./store"
import { ConditionEditor } from "./ConditionEditor"
import { Field, LText } from "./ui"
import { allSubjects } from "./subjects"
import { describeCondition } from "./describe"
import { getDefaultL, uniqueId } from "./lstring"
import { itemScore } from "@/survey/scoring"

export function ScoresDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const survey = useBuilder((s) => s.survey)
  const change = useBuilder((s) => s.change)
  const scores = survey.scores ?? []
  const lang = survey.defaultLanguage ?? "en"
  const scorable = survey.questions.filter((q) => !isDisplayItem(q) && !["short", "text", "date", "time", "datetime", "ranking"].includes(q.type))
  const setScores = (next: ScoreDefinition[]) => change((s) => ({ ...s, scores: next.length ? next : undefined }))
  const set = (i: number, patch: Partial<ScoreDefinition>) => setScores(scores.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const add = () => setScores([...scores, { id: uniqueId("total", new Set(scores.map((s) => s.id))), label: "Total score", method: "sum", questions: [] }])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scores</DialogTitle>
          <DialogDescription>
            Totals or averages calculated when the participant submits, saved in the results (static_data.scores). Scores can also be used in show-if rules and alerts. Choice options score their
            "Score" field, or their saved value when it is a number; Yes = 1, No = 0.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {scores.map((sc, i) => (
            <div key={i} className="grid gap-3 rounded-lg border p-3">
              <div className="grid grid-cols-[1fr_9rem_8rem_auto] items-end gap-2">
                <Field label="Name">
                  <LText value={sc.label} onChange={(label) => set(i, { label })} />
                </Field>
                <Field label="Id">
                  <Input value={sc.id} onChange={(e) => set(i, { id: e.target.value })} className="font-mono" aria-label="Score id" />
                </Field>
                <Field label="Calculation">
                  <Select value={sc.method} onValueChange={(m) => set(i, { method: m as ScoreDefinition["method"] })}>
                    <SelectTrigger aria-label="Calculation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sum">Sum</SelectItem>
                      <SelectItem value="mean">Average</SelectItem>
                      <SelectItem value="count">Count answered</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button variant="ghost" size="icon" aria-label="Remove score" onClick={() => setScores(scores.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
              <Field label={`Questions included (${sc.questions.length})`}>
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2">
                  {scorable.map((q) => {
                    const on = sc.questions.includes(q.id)
                    const example = itemScore(q, "options" in q && Array.isArray(q.options) && q.options[0] ? q.options[0].value : q.type === "boolean" ? "Yes" : 1)
                    return (
                      <label key={q.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                        <Checkbox checked={on} onCheckedChange={(c) => set(i, { questions: c ? [...sc.questions, q.id] : sc.questions.filter((x) => x !== q.id) })} />
                        <span className="truncate">{getDefaultL(q.text, lang) || q.id}</span>
                        {example == null ? <Badge variant="outline">no numeric score</Badge> : null}
                      </label>
                    )
                  })}
                  {scorable.length === 0 ? <p className="text-sm text-muted-foreground">Add scale or choice questions first.</p> : null}
                </div>
              </Field>
            </div>
          ))}
          <Button variant="outline" className="justify-self-start" onClick={add}>
            <PlusIcon /> Add score
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AlertsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const survey = useBuilder((s) => s.survey)
  const change = useBuilder((s) => s.change)
  const alerts = survey.alerts ?? []
  const lang = survey.defaultLanguage ?? "en"
  const setAlerts = (next: AlertDefinition[]) => change((s) => ({ ...s, alerts: next.length ? next : undefined }))
  const set = (i: number, patch: Partial<AlertDefinition>, key?: string) =>
    change((s) => ({ ...s, alerts: (s.alerts ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) }), key)
  const add = () =>
    setAlerts([
      ...alerts,
      { id: uniqueId("alert", new Set(alerts.map((a) => a.id))), when: { all: [] }, title: "", message: "", severity: "warning", timing: "submit" },
    ])
  const subjects = allSubjects(survey)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alerts</DialogTitle>
          <DialogDescription>
            Messages shown to the participant when answers or scores meet a condition, e.g. crisis resources. Triggered alerts are recorded in the results (static_data.alerts). Alerts do not notify
            anyone - follow your study's safety protocol.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {alerts.map((a, i) => (
            <div key={i} className="grid gap-3 rounded-lg border p-3">
              <div className="grid grid-cols-[1fr_8rem_9rem_auto] items-end gap-2">
                <Field label="Id">
                  <Input value={a.id} onChange={(e) => set(i, { id: e.target.value }, `a${i}.id`)} className="font-mono" aria-label="Alert id" />
                </Field>
                <Field label="Importance">
                  <Select value={a.severity} onValueChange={(v) => set(i, { severity: v as AlertDefinition["severity"] })}>
                    <SelectTrigger aria-label="Importance">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="When to show">
                  <Select value={a.timing} onValueChange={(v) => set(i, { timing: v as AlertDefinition["timing"] })}>
                    <SelectTrigger aria-label="When to show">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Right away</SelectItem>
                      <SelectItem value="submit">After Submit</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button variant="ghost" size="icon" aria-label="Remove alert" onClick={() => setAlerts(alerts.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
              <Field label="Title">
                <LText value={a.title} onChange={(title) => set(i, { title: title || undefined }, `a${i}.t`)} placeholder="Important" />
              </Field>
              <Field label="Message" hint="Formatting and links are allowed.">
                <LText multiline rows={3} value={a.message} onChange={(message) => set(i, { message }, `a${i}.m`)} />
              </Field>
              <Field label="Show when">
                <ConditionEditor value={a.when} onChange={(when) => set(i, { when: when ?? { all: [] } })} subjects={subjects} lang={lang} emptyText="Add a rule to choose when this alert appears." />
                {describeCondition(a.when, survey) ? <p className="text-xs text-muted-foreground">Shown when {describeCondition(a.when, survey)}.</p> : null}
              </Field>
            </div>
          ))}
          <Button variant="outline" className="justify-self-start" onClick={add}>
            <PlusIcon /> Add alert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
