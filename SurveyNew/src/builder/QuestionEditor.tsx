import * as React from "react"
import { CopyIcon, EyeIcon, GitBranchIcon, Trash2Icon } from "lucide-react"
import type { LikertPreset, Question, QuestionType } from "@/survey/schema"
import { ID_PATTERN, LIKERT_PRESETS, isDisplayItem, canRandomize } from "@/survey/schema"
import { PRESET_LABELS, presetOptions } from "@/survey/options"
import { makeTranslator } from "@/survey/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useBuilder } from "./store"
import { TYPE_INFO, typeInfo } from "./questionTypes"
import { ConditionEditor } from "./ConditionEditor"
import { OptionsEditor, RowsEditor } from "./OptionsEditor"
import { Field, LText, NumberInput, SwitchRow, useEditLanguage } from "./ui"
import { subjectsBefore } from "./subjects"
import { describeCondition } from "./describe"
import type { Issue } from "./validate"

const GROUPS = ["Choice", "Scale", "Entry", "Date & time", "Layout"] as const

function TypeSelect({ value, onChange }: { value: QuestionType; onChange: (t: QuestionType) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as QuestionType)}>
      <SelectTrigger className="w-56" aria-label="Question type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GROUPS.map((g) => (
          <SelectGroup key={g}>
            <SelectLabel>{g}</SelectLabel>
            {TYPE_INFO.filter((t) => t.group === g).map((t) => (
              <SelectItem key={t.type} value={t.type}>
                <t.icon className="size-4" /> {t.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function ScaleChoice({
  preset,
  hasCustom,
  onPreset,
  onCustom,
}: {
  preset: LikertPreset | undefined
  hasCustom: boolean
  onPreset: (p: LikertPreset) => void
  onCustom: () => void
}) {
  return (
    <Field label="Answer scale">
      <Select value={hasCustom ? "custom" : (preset ?? "agree5")} onValueChange={(v) => (v === "custom" ? onCustom() : onPreset(v as LikertPreset))}>
        <SelectTrigger className="w-full max-w-sm" aria-label="Answer scale">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIKERT_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {PRESET_LABELS[p]}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom scale...</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Settings that depend on the question type. */
function TypeSettings({ q, update }: { q: Question; update: (patch: Partial<Question>, coalesce?: string) => void }) {
  const set = (patch: Record<string, unknown>, key?: string) => update(patch as Partial<Question>, key)
  const en = React.useMemo(() => makeTranslator("en"), [])
  switch (q.type) {
    case "single":
    case "dropdown":
    case "multiple":
    case "ranking":
      return (
        <div className="grid gap-4">
          <Field label="Options">
            <OptionsEditor options={q.options} onChange={(options) => set({ options })} showExclusive={q.type === "multiple"} showScore={q.type !== "ranking"} showDescription={q.type !== "dropdown"} />
          </Field>
          {q.type === "multiple" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum selections">
                <NumberInput aria-label="Minimum selections" value={q.minSelected} onChange={(n) => set({ minSelected: n })} placeholder="None" />
              </Field>
              <Field label="Maximum selections">
                <NumberInput aria-label="Maximum selections" value={q.maxSelected} onChange={(n) => set({ maxSelected: n })} placeholder="No limit" />
              </Field>
            </div>
          ) : null}
          {q.type === "dropdown" ? (
            <Field label="Placeholder">
              <LText value={q.placeholder} onChange={(v) => set({ placeholder: v }, `${q.id}.ph`)} placeholder="Select an option" />
            </Field>
          ) : null}
        </div>
      )
    case "likert":
    case "matrix":
      return (
        <div className="grid gap-4">
          {q.type === "matrix" ? (
            <Field label="Rows (items)" hint="Each row is answered on the same scale and saved as its own result line.">
              <RowsEditor rows={q.rows} onChange={(rows) => set({ rows })} />
            </Field>
          ) : null}
          <ScaleChoice
            preset={q.preset}
            hasCustom={!!q.options?.length}
            onPreset={(preset) => set({ preset, options: undefined })}
            onCustom={() => set({ options: presetOptions(q.preset ?? "agree5", en) })}
          />
          {q.options?.length ? (
            <OptionsEditor options={q.options} onChange={(options) => set({ options })} numeric showScore={false} showDescription={false} />
          ) : null}
        </div>
      )
    case "boolean":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label='"Yes" label' hint='Saved as "Yes"'>
            <LText value={q.yesLabel} onChange={(v) => set({ yesLabel: v || undefined }, `${q.id}.yes`)} placeholder="Yes" />
          </Field>
          <Field label='"No" label' hint='Saved as "No"'>
            <LText value={q.noLabel} onChange={(v) => set({ noLabel: v || undefined }, `${q.id}.no`)} placeholder="No" />
          </Field>
        </div>
      )
    case "slider":
      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Minimum">
              <NumberInput aria-label="Minimum" value={q.min} onChange={(n) => set({ min: n ?? 0 })} allowEmpty={false} />
            </Field>
            <Field label="Maximum">
              <NumberInput aria-label="Maximum" value={q.max} onChange={(n) => set({ max: n ?? 10 })} allowEmpty={false} />
            </Field>
            <Field label="Step">
              <NumberInput aria-label="Step" value={q.step} onChange={(n) => set({ step: n })} placeholder="1" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Label at minimum">
              <LText value={q.minLabel} onChange={(v) => set({ minLabel: v || undefined }, `${q.id}.minl`)} />
            </Field>
            <Field label="Label in the middle">
              <LText value={q.midLabel} onChange={(v) => set({ midLabel: v || undefined }, `${q.id}.midl`)} />
            </Field>
            <Field label="Label at maximum">
              <LText value={q.maxLabel} onChange={(v) => set({ maxLabel: v || undefined }, `${q.id}.maxl`)} />
            </Field>
          </div>
          <Field label="Unit" hint='Shown after the number, e.g. "cups"'>
            <LText value={q.unit} onChange={(v) => set({ unit: v || undefined }, `${q.id}.unit`)} />
          </Field>
          <SwitchRow id={`${q.id}-showvalue`} label="Show the selected number" checked={q.showValue !== false} onCheckedChange={(v) => set({ showValue: v ? undefined : false })} />
          <SwitchRow id={`${q.id}-ticks`} label="Show tick marks" hint="Up to 20 steps" checked={!!q.showTicks} onCheckedChange={(v) => set({ showTicks: v || undefined })} />
        </div>
      )
    case "vas":
      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Left end label (0)">
              <LText value={q.minLabel} onChange={(v) => set({ minLabel: v || undefined }, `${q.id}.minl`)} />
            </Field>
            <Field label="Right end label (100)">
              <LText value={q.maxLabel} onChange={(v) => set({ maxLabel: v || undefined }, `${q.id}.maxl`)} />
            </Field>
          </div>
          <SwitchRow id={`${q.id}-vasvalue`} label="Show the number to participants" hint="Usually off for visual analogue scales" checked={!!q.showValue} onCheckedChange={(v) => set({ showValue: v || undefined })} />
        </div>
      )
    case "rating":
      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lowest number">
              <NumberInput aria-label="Lowest number" value={q.min} onChange={(n) => set({ min: n ?? 0 })} allowEmpty={false} />
            </Field>
            <Field label="Highest number">
              <NumberInput aria-label="Highest number" value={q.max} onChange={(n) => set({ max: n ?? 10 })} allowEmpty={false} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label under the lowest">
              <LText value={q.minLabel} onChange={(v) => set({ minLabel: v || undefined }, `${q.id}.minl`)} />
            </Field>
            <Field label="Label under the highest">
              <LText value={q.maxLabel} onChange={(v) => set({ maxLabel: v || undefined }, `${q.id}.maxl`)} />
            </Field>
          </div>
        </div>
      )
    case "faces":
      return (
        <div className="grid gap-3">
          <Field label="Number of faces" hint="Saved as 1 (worst) up to the number of faces (best).">
            <ToggleGroup type="single" variant="outline" value={String(q.count ?? 5)} onValueChange={(v) => v && set({ count: Number(v) })}>
              {["3", "5", "7"].map((n) => (
                <ToggleGroupItem key={n} value={n} className="w-12">
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <SwitchRow id={`${q.id}-facelabels`} label="Show labels under faces" checked={q.showLabels !== false} onCheckedChange={(v) => set({ showLabels: v ? undefined : false })} />
        </div>
      )
    case "number":
      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Minimum">
              <NumberInput aria-label="Minimum" value={q.min} onChange={(n) => set({ min: n })} placeholder="None" />
            </Field>
            <Field label="Maximum">
              <NumberInput aria-label="Maximum" value={q.max} onChange={(n) => set({ max: n })} placeholder="None" />
            </Field>
            <Field label="Decimal places">
              <NumberInput aria-label="Decimal places" value={q.decimals} onChange={(n) => set({ decimals: n })} placeholder="0" />
            </Field>
          </div>
          <Field label="Unit" hint='Shown next to the box, e.g. "kg"'>
            <LText value={q.unit} onChange={(v) => set({ unit: v || undefined }, `${q.id}.unit`)} />
          </Field>
        </div>
      )
    case "short":
    case "text":
      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placeholder">
              <LText value={q.placeholder} onChange={(v) => set({ placeholder: v || undefined }, `${q.id}.ph`)} />
            </Field>
            <Field label="Maximum characters">
              <NumberInput aria-label="Maximum characters" value={q.maxLength} onChange={(n) => set({ maxLength: n })} placeholder={q.type === "text" ? "2000" : "250"} />
            </Field>
          </div>
          {q.type === "short" ? (
            <Field label="Keyboard / format">
              <Select value={q.inputMode ?? "text"} onValueChange={(v) => set({ inputMode: v === "text" ? undefined : v })}>
                <SelectTrigger className="w-48" aria-label="Keyboard">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="email">Email (checked)</SelectItem>
                  <SelectItem value="tel">Phone number</SelectItem>
                  <SelectItem value="numeric">Digits</SelectItem>
                  <SelectItem value="url">Web address</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
      )
    case "date":
    case "datetime":
    case "time":
      return (
        <div className="grid gap-3">
          {q.type !== "date" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Clock">
                <ToggleGroup type="single" variant="outline" value={q.format ?? "12h"} onValueChange={(v) => v && set({ format: v })}>
                  <ToggleGroupItem value="12h">12-hour</ToggleGroupItem>
                  <ToggleGroupItem value="24h">24-hour</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field label="Minute step">
                <Select value={String(q.minuteStep ?? 5)} onValueChange={(v) => set({ minuteStep: Number(v) })}>
                  <SelectTrigger className="w-28" aria-label="Minute step">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 5, 10, 15, 30].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}
          {q.type !== "time" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Earliest date" hint='"today", "-30d", "+1y" or 2026-01-31'>
                <Input value={q.minDate ?? ""} onChange={(e) => set({ minDate: e.target.value || undefined }, `${q.id}.mind`)} placeholder="Any" />
              </Field>
              <Field label="Latest date" hint='e.g. "today" to block future dates'>
                <Input value={q.maxDate ?? ""} onChange={(e) => set({ maxDate: e.target.value || undefined }, `${q.id}.maxd`)} placeholder="Any" />
              </Field>
            </div>
          ) : null}
        </div>
      )
    case "duration":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Maximum hours">
            <NumberInput aria-label="Maximum hours" value={q.maxHours} onChange={(n) => set({ maxHours: n })} placeholder="24" />
          </Field>
          <Field label="Minute step">
            <NumberInput aria-label="Minute step" value={q.minuteStep} onChange={(n) => set({ minuteStep: n })} placeholder="5" />
          </Field>
        </div>
      )
    default:
      return null
  }
}

export function QuestionEditor({ issues, onPreviewFrom }: { issues: Issue[]; onPreviewFrom: (id: string) => void }) {
  const survey = useBuilder((s) => s.survey)
  const selectedId = useBuilder((s) => s.selectedId)
  const { updateQuestion, changeType, removeQuestion, duplicateQuestion, renameQuestion } = useBuilder.getState()
  const { translating, editLang } = useEditLanguage()
  const index = survey.questions.findIndex((q) => q.id === selectedId)
  const q = survey.questions[index]
  const [idDraft, setIdDraft] = React.useState(q?.id ?? "")
  React.useEffect(() => setIdDraft(q?.id ?? ""), [q?.id])

  if (!q) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
        <p>Select a question on the left, or add one.</p>
      </div>
    )
  }

  const lang = survey.defaultLanguage ?? "en"
  const update = (patch: Partial<Question>, coalesce?: string) => updateQuestion(q.id, patch, coalesce)
  const display = isDisplayItem(q)
  const info = typeInfo(q.type)
  const myIssues = issues.filter((i) => i.questionId === q.id)
  const idTaken = idDraft !== q.id && survey.questions.some((x) => x.id === idDraft)
  const idValid = ID_PATTERN.test(idDraft) && !idTaken

  return (
    <div className="grid content-start gap-4 p-4 lg:p-6" data-testid="question-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="tabular-nums">
          #{index + 1}
        </Badge>
        <TypeSelect value={q.type} onChange={(t) => changeType(q.id, t)} />
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => onPreviewFrom(q.id)} title="Preview starting at this question">
            <EyeIcon /> Preview here
          </Button>
          <Button variant="ghost" size="icon" aria-label="Duplicate question" onClick={() => duplicateQuestion(q.id)}>
            <CopyIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete question" onClick={() => removeQuestion(q.id)}>
            <Trash2Icon />
          </Button>
        </div>
      </div>
      {translating ? (
        <p className="rounded-md border border-dashed border-warning/60 bg-warning/5 px-3 py-2 text-xs">
          Translating into <strong>{editLang}</strong>. Grey placeholder text shows the default language; dashed boxes still need a translation.
        </p>
      ) : null}
      {myIssues.length ? (
        <ul className="grid gap-1 rounded-md border bg-muted/40 p-3 text-xs">
          {myIssues.map((i, k) => (
            <li key={k} className={i.level === "error" ? "text-destructive" : "text-warning"}>
              {i.level === "error" ? "Error: " : "Note: "}
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="logic">
            Logic {q.showIf || q.endSurveyIf ? <GitBranchIcon className="size-3.5 text-primary" /> : null}
          </TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="grid gap-4 pt-3">
          <Field
            label={q.type === "section" ? "Section title" : q.type === "info" ? "Text" : "Question"}
            htmlFor="q-text"
            hint={<>Formatting: **bold**, *italic*, [link](https://...), "- " for lists. Insert an earlier answer with {"{{question_id}}"}.</>}
          >
            <LText id="q-text" value={q.text} onChange={(text) => update({ text }, `${q.id}.text`)} multiline rows={q.type === "info" ? 5 : 2} placeholder={info.label} />
          </Field>
          <Field label={q.type === "section" ? "Section description" : "Help text (optional)"} htmlFor="q-desc">
            <LText id="q-desc" value={q.description} onChange={(description) => update({ description: description || undefined }, `${q.id}.desc`)} multiline rows={2} />
          </Field>
          {!display ? (
            <SwitchRow id="q-required" label="Answer required" hint="Optional questions show an “Optional” tag and can be skipped." checked={q.required !== false} onCheckedChange={(v) => update({ required: v ? undefined : false })} />
          ) : null}
          <TypeSettings q={q} update={update} />
        </TabsContent>

        <TabsContent value="logic" className="grid gap-5 pt-3">
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Show this {display ? "item" : "question"} only if...</h3>
            <p className="text-xs text-muted-foreground">Leave empty to always show it. Rules can use answers to earlier questions and scores.</p>
            <ConditionEditor value={q.showIf} onChange={(showIf) => update({ showIf })} subjects={subjectsBefore(survey, index)} lang={lang} emptyText="Always shown." />
            {q.showIf ? <p className="text-xs text-muted-foreground">Shown when {describeCondition(q.showIf, survey)}.</p> : null}
          </section>
          {!display ? (
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">End the survey after this question if...</h3>
              <p className="text-xs text-muted-foreground">Useful for screening: the remaining questions are skipped and the participant can submit.</p>
              <ConditionEditor value={q.endSurveyIf} onChange={(endSurveyIf) => update({ endSurveyIf })} subjects={subjectsBefore(survey, index, true)} lang={lang} emptyText="Never ends early." />
              {q.endSurveyIf ? <p className="text-xs text-muted-foreground">Ends when {describeCondition(q.endSurveyIf, survey)}.</p> : null}
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="advanced" className="grid gap-4 pt-3">
          <Field label="Question id" hint="Used by logic, scores and in the results (static_data.answers). Renaming updates references in this survey, but changes the data key for future responses.">
            <div className="flex gap-2">
              <Input aria-label="Question id" value={idDraft} onChange={(e) => setIdDraft(e.target.value)} className="font-mono" aria-invalid={!idValid || undefined} />
              <Button variant="outline" disabled={!idValid || idDraft === q.id} onClick={() => renameQuestion(q.id, idDraft)}>
                Rename
              </Button>
            </div>
            {!idValid ? <p className="text-xs text-destructive">{idTaken ? "That id is already used." : "Start with a letter; use letters, digits and _ only."}</p> : null}
          </Field>
          {canRandomize(q) ? (
            <SwitchRow
              id="q-random"
              label="Shuffle option order"
              hint="Each participant sees a different order (options that clear others stay last). The order shown is saved with the results."
              checked={!!q.randomizeOptions}
              onCheckedChange={(v) => update({ randomizeOptions: v || undefined })}
            />
          ) : null}
          {q.type === "matrix" ? (
            <SwitchRow id="q-randomrows" label="Shuffle row order" checked={!!q.randomizeRows} onCheckedChange={(v) => update({ randomizeRows: v || undefined })} />
          ) : null}
          {q.type === "single" || q.type === "dropdown" || q.type === "multiple" ? (
            <>
              <SwitchRow id="q-other" label='Add an "Other" option with a text box' hint='Saved as "other", with the typed text as an extra result line.' checked={!!q.allowOther} onCheckedChange={(v) => update({ allowOther: v || undefined })} />
              {q.allowOther ? (
                <Field label='Label for "Other"'>
                  <LText value={q.otherLabel} onChange={(v) => update({ otherLabel: v || undefined }, `${q.id}.otherl`)} placeholder="Other" />
                </Field>
              ) : null}
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
