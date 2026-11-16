import type { Appearance, SurveyOptions } from "@/survey/schema"
import { DEFAULT_APPEARANCE, DEFAULT_OPTIONS } from "@/survey/schema"
import { THEMES, RADII } from "@/styles/themes/registry"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { useBuilder } from "./store"
import { Field, LText, NumberInput, SwitchRow } from "./ui"

export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const survey = useBuilder((s) => s.survey)
  const meta = useBuilder((s) => s.meta)
  const { change, setMeta } = useBuilder.getState()
  const o: SurveyOptions = { ...DEFAULT_OPTIONS, ...survey.options, resume: { ...DEFAULT_OPTIONS.resume, ...survey.options?.resume } }
  const a: Appearance = { ...DEFAULT_APPEARANCE, ...survey.appearance }
  const setO = (patch: Partial<SurveyOptions>) => change((s) => ({ ...s, options: { ...o, ...patch } }))
  const setA = (patch: Partial<Appearance>) => change((s) => ({ ...s, appearance: { ...a, ...patch } }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Survey settings</SheetTitle>
          <SheetDescription>How the survey looks and behaves on participants' phones.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-8">
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">About</h3>
            <Field label="Activity name" hint="Shown in the MindCheck app list. Used when exporting or creating the activity.">
              <Input value={meta.name} onChange={(e) => setMeta({ name: e.target.value })} placeholder="e.g. Morning check-in" />
            </Field>
            <Field label="Title shown at the top of the survey" hint="Leave empty to use the activity name.">
              <LText value={survey.title} onChange={(title) => change((s) => ({ ...s, title: title || undefined }), "title")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Instrument id" tip="Optional short code saved with every response, e.g. phq9.">
                <Input value={survey.id ?? ""} onChange={(e) => change((s) => ({ ...s, id: e.target.value || undefined }), "sid")} placeholder="optional" className="font-mono" />
              </Field>
              <Field label="Version" tip="Saved with every response so you can tell versions apart. Publishing increases it automatically.">
                <Input value={survey.version ?? ""} onChange={(e) => change((s) => ({ ...s, version: e.target.value || undefined }), "ver")} placeholder="1" className="font-mono" />
              </Field>
            </div>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Screens</h3>
            <Field label="Layout">
              <ToggleGroup type="single" variant="outline" value={o.layout} onValueChange={(v) => v && setO({ layout: v as SurveyOptions["layout"] })} className="w-full">
                <ToggleGroupItem value="question" className="flex-1">One question per screen</ToggleGroupItem>
                <ToggleGroupItem value="section" className="flex-1">One section per screen</ToggleGroupItem>
                <ToggleGroupItem value="single" className="flex-1">All on one page</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <SwitchRow id="o-progress" label="Show progress bar" checked={o.showProgress} onCheckedChange={(v) => setO({ showProgress: v })} />
            <SwitchRow id="o-numbers" label="Number the questions" checked={o.showQuestionNumbers} onCheckedChange={(v) => setO({ showQuestionNumbers: v })} />
            <SwitchRow id="o-back" label="Allow going back" checked={o.allowBackNavigation} onCheckedChange={(v) => setO({ allowBackNavigation: v })} />
            <SwitchRow id="o-auto" label="Auto-advance" hint="Go to the next screen right after a single tap (one question per screen). Great for quick EMAs." checked={o.autoAdvance} onCheckedChange={(v) => setO({ autoAdvance: v })} />
            <SwitchRow id="o-exit" label="Confirm before leaving" checked={o.confirmExit} onCheckedChange={(v) => setO({ confirmExit: v })} />
            <SwitchRow id="o-resume" label="Let participants resume" hint="Unfinished answers are kept on the phone and offered when the survey is opened again." checked={o.resume.enabled} onCheckedChange={(v) => setO({ resume: { ...o.resume, enabled: v } })} />
            {o.resume.enabled ? (
              <Field label="Forget unfinished answers after (hours)">
                <NumberInput aria-label="Resume expiry hours" value={o.resume.expiresAfterHours} onChange={(n) => setO({ resume: { ...o.resume, expiresAfterHours: n ?? 12 } })} className="w-28" />
              </Field>
            ) : null}
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Welcome and thank-you screens (optional)</h3>
            <Field label="Welcome title">
              <LText value={survey.intro?.title} onChange={(title) => change((s) => ({ ...s, intro: clean({ ...s.intro, title }) }), "it")} />
            </Field>
            <Field label="Welcome text">
              <LText multiline rows={3} value={survey.intro?.body} onChange={(body) => change((s) => ({ ...s, intro: clean({ ...s.intro, body }) }), "ib")} />
            </Field>
            <Field label="Thank-you title">
              <LText value={survey.completion?.title} onChange={(title) => change((s) => ({ ...s, completion: clean({ ...s.completion, title }) }), "ct")} />
            </Field>
            <Field label="Thank-you text" hint="Leave both empty to return to the app right after Submit.">
              <LText multiline rows={2} value={survey.completion?.body} onChange={(body) => change((s) => ({ ...s, completion: clean({ ...s.completion, body }) }), "cb")} />
            </Field>
          </section>
          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Appearance</h3>
            <Field label="Colour theme">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={a.theme === t.id}
                    onClick={() => setA({ theme: t.id })}
                    className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", a.theme === t.id && "border-primary ring-2 ring-primary/30")}
                  >
                    <span className="size-3.5 rounded-full" style={{ background: t.swatch }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Light or dark">
              <ToggleGroup type="single" variant="outline" value={a.mode} onValueChange={(v) => v && setA({ mode: v as Appearance["mode"] })}>
                <ToggleGroupItem value="light">Light</ToggleGroupItem>
                <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                <ToggleGroupItem value="system">Follow phone</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field label="Corner roundness">
              <ToggleGroup type="single" variant="outline" value={a.radius} onValueChange={(v) => v && setA({ radius: v as Appearance["radius"] })}>
                {RADII.map((r) => (
                  <ToggleGroupItem key={r} value={r} className="w-14 capitalize">
                    {r}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function clean<T extends Record<string, unknown>>(o: T): T | undefined {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(typeof v === "object" && v && Object.keys(v).length === 0))
  return entries.length ? (Object.fromEntries(entries) as T) : undefined
}
