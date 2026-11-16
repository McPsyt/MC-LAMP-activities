import * as React from "react"
import { CopyIcon, DownloadIcon, FileUpIcon } from "lucide-react"
import { toast } from "sonner"
import type { SurveyDefinition } from "@/survey/schema"
import { SPEC_ID } from "@/survey/schema"
import { convertLegacySurvey, looksLikeLegacySettings } from "@/survey/legacy"
import { decodeDashboardFile, encodeDashboardFile, makeDashboardActivity, type DashboardActivity } from "@/survey/dashboardFile"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useBuilder } from "./store"
import { Field, downloadText, fileSafeName, readFileText } from "./ui"
import { parseSurveyJson, type Issue } from "./validate"

export interface ImportCandidate {
  label: string
  kind: "survey" | "legacy" | "other"
  name?: string
  description?: string
  survey?: SurveyDefinition
  notes: string[]
  errors: string[]
}

/** Work out what a pasted/uploaded file contains. */
export function analyseImport(text: string): ImportCandidate[] {
  let value: unknown
  try {
    value = decodeDashboardFile(text)
  } catch {
    return [{ label: "File", kind: "other", notes: [], errors: ["This isn't a survey file, a dashboard export, or JSON."] }]
  }
  const fromSettings = (settings: unknown, name?: string, description?: string): ImportCandidate => {
    if (looksLikeLegacySettings(settings)) {
      const { survey, notes } = convertLegacySurvey(settings, name)
      return { label: name ?? "Classic survey", kind: "legacy", name, description, survey, notes: ["Converted from a classic MindCheck survey.", ...notes], errors: [] }
    }
    const r = parseSurveyJson(settings)
    return { label: name ?? (r.survey?.title ? String(typeof r.survey.title === "string" ? r.survey.title : Object.values(r.survey.title)[0]) : "Survey"), kind: "survey", name, description, survey: r.survey, notes: [], errors: r.errors }
  }
  if (Array.isArray(value) && value.every((a) => a && typeof a === "object" && "spec" in a)) {
    return (value as DashboardActivity[]).map((a) => {
      if (a.spec === SPEC_ID || a.spec === "lamp.survey") return { ...fromSettings(a.settings, a.name, typeof a.description === "string" ? a.description : undefined), label: a.name }
      return { label: a.name ?? "Activity", kind: "other", notes: [], errors: [`"${a.spec}" activities can't be edited here.`] }
    })
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "spec" in value) {
    const a = value as DashboardActivity
    return [fromSettings(a.settings, a.name)]
  }
  return [fromSettings(value)]
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const load = useBuilder((s) => s.load)
  const hasQuestions = useBuilder((s) => s.survey.questions.length > 0)
  const [text, setText] = React.useState("")
  const [candidates, setCandidates] = React.useState<ImportCandidate[] | null>(null)
  const [drag, setDrag] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) {
      setText("")
      setCandidates(null)
    }
  }, [open])

  const analyse = (t: string) => {
    setText(t)
    setCandidates(t.trim() ? analyseImport(t) : null)
  }
  const onFile = async (f: File | undefined) => {
    if (f) analyse(await readFileText(f))
  }
  const choose = (c: ImportCandidate) => {
    if (!c.survey) return
    load(c.survey, { name: c.name ?? "", description: c.description ?? "" })
    toast.success(`Imported "${c.label}"`, { description: c.notes.join(" ") || undefined })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            Open a survey file saved from this builder, or an <strong>export file from the MindCheck dashboard</strong> (Activities → Export). Classic surveys are converted automatically.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            void onFile(e.dataTransfer.files[0])
          }}
          className={cn("grid place-items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm", drag && "border-primary bg-primary/5")}
        >
          <FileUpIcon className="size-6 text-muted-foreground" />
          <p>Drop a file here, or</p>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
          <input ref={inputRef} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" data-testid="import-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <Field label="...or paste the file contents">
          <Textarea rows={4} value={text} onChange={(e) => analyse(e.target.value)} className="font-mono text-xs" aria-label="Paste file contents" />
        </Field>
        {candidates ? (
          <div className="grid gap-2" data-testid="import-candidates">
            {candidates.map((c, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <div className="grid flex-1 gap-1">
                  <div className="flex items-center gap-2 font-medium">
                    {c.label}
                    {c.kind === "legacy" ? <Badge variant="secondary">classic survey</Badge> : null}
                    {c.survey ? <Badge variant="outline">{c.survey.questions.length} items</Badge> : null}
                  </div>
                  {c.errors.map((e, k) => (
                    <p key={k} className="text-xs text-destructive">
                      {e}
                    </p>
                  ))}
                  {c.notes.map((n, k) => (
                    <p key={k} className="text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </div>
                <Button size="sm" disabled={!c.survey || c.errors.length > 0} onClick={() => choose(c)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {hasQuestions ? <p className="text-xs text-muted-foreground">Opening a file replaces the survey in the editor. Export the current one first if you want to keep it.</p> : null}
      </DialogContent>
    </Dialog>
  )
}

export function ExportDialog({ open, onOpenChange, issues }: { open: boolean; onOpenChange: (o: boolean) => void; issues: Issue[] }) {
  const survey = useBuilder((s) => s.survey)
  const meta = useBuilder((s) => s.meta)
  const setMeta = useBuilder((s) => s.setMeta)
  const errors = issues.filter((i) => i.level === "error")
  const name = meta.name.trim()
  const base = fileSafeName(name || "survey")

  const dashboardFile = () => {
    downloadText(`${base}-dashboard-import.json`, encodeDashboardFile([makeDashboardActivity(survey, { name, description: meta.description })]), "text/plain")
    toast.success("Dashboard import file downloaded")
  }
  const surveyFile = () => {
    downloadText(`${base}.survey.json`, JSON.stringify(survey, null, 2))
    toast.success("Survey file downloaded")
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(survey, null, 2))
      toast.success("Survey JSON copied")
    } catch {
      toast.error("Copy is blocked here; use the download instead.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Save your work or prepare a file for the MindCheck dashboard.</DialogDescription>
        </DialogHeader>
        {errors.length ? (
          <Alert variant="destructive">
            <AlertTitle>Fix {errors.length} problem{errors.length === 1 ? "" : "s"} first</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <section className="grid gap-3 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">For the MindCheck dashboard</h3>
          <Field label="Activity name" hint="Shown to participants in the app.">
            <Input value={meta.name} onChange={(e) => setMeta({ name: e.target.value })} placeholder="e.g. Morning check-in" aria-label="Activity name" />
          </Field>
          <Field label="Description (optional)">
            <Input value={meta.description} onChange={(e) => setMeta({ description: e.target.value })} aria-label="Description" />
          </Field>
          <Button onClick={dashboardFile} disabled={errors.length > 0 || !name}>
            <DownloadIcon /> Download dashboard import file
          </Button>
          <p className="text-xs text-muted-foreground">
            In the dashboard: <strong>Activities → Import</strong>, choose this file and a study. Each import creates a <em>new</em> activity; to update an existing one use <strong>Server → Publish</strong>.
          </p>
        </section>
        <section className="grid gap-2 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">Survey file</h3>
          <p className="text-xs text-muted-foreground">Keep a copy, share it with a colleague, or open it again later with Import.</p>
          <DialogFooter className="justify-start sm:justify-start">
            <Button variant="outline" onClick={surveyFile} disabled={errors.length > 0}>
              <DownloadIcon /> Download survey file
            </Button>
            <Button variant="ghost" onClick={copy}>
              <CopyIcon /> Copy JSON
            </Button>
          </DialogFooter>
        </section>
      </DialogContent>
    </Dialog>
  )
}
