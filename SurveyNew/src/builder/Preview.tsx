import * as React from "react"
import { CodeIcon, RotateCcwIcon, SmartphoneIcon } from "lucide-react"
import type { ActivityResult } from "@/survey/schema"
import { normalizeSurvey } from "@/survey/normalize"
import { UI_LANGUAGES } from "@/survey/i18n"
import { SurveyRunner } from "@/renderer/SurveyRunner"
import { applyAppearance } from "@/renderer/theme"
import { PortalContainerProvider } from "@/lib/portal"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useBuilder } from "./store"

export interface PreviewHandle {
  restart: (startAt?: string) => void
}

/** Live phone preview using the exact renderer participants get. */
export const Preview = React.forwardRef<PreviewHandle>(function Preview(_, ref) {
  const survey = useBuilder((s) => s.survey)
  const name = useBuilder((s) => s.meta.name)
  const [lang, setLang] = React.useState(survey.defaultLanguage ?? "en")
  const [run, setRun] = React.useState({ n: 0, startAt: undefined as string | undefined })
  const [outcome, setOutcome] = React.useState<{ kind: "submitted"; result: ActivityResult } | { kind: "closed" } | null>(null)
  const [showData, setShowData] = React.useState(false)
  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null)

  React.useImperativeHandle(ref, () => ({
    restart: (startAt) => {
      setOutcome(null)
      setRun((r) => ({ n: r.n + 1, startAt }))
    },
  }))

  const normalized = React.useMemo(() => {
    try {
      return { survey: normalizeSurvey(survey), error: null }
    } catch (e) {
      return { survey: null, error: String((e as Error).message) }
    }
  }, [survey])

  React.useEffect(() => {
    if (frame && normalized.survey) applyAppearance(frame, normalized.survey.appearance)
  }, [frame, normalized.survey])

  const languages = React.useMemo(() => (survey.languages?.length ? survey.languages : [survey.defaultLanguage ?? "en"]), [survey.languages, survey.defaultLanguage])
  React.useEffect(() => {
    if (!languages.includes(lang)) setLang(languages[0])
  }, [languages, lang])

  const restart = () => {
    setOutcome(null)
    setRun((r) => ({ n: r.n + 1, startAt: undefined }))
  }

  return (
    <div className="flex h-full flex-col bg-muted/40">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <SmartphoneIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Preview</h2>
        <div className="ml-auto flex items-center gap-1.5">
          {languages.length > 1 ? (
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger size="sm" className="h-8 w-28" aria-label="Preview language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l} value={l}>
                    {UI_LANGUAGES[l]?.label ?? l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button size="sm" variant={showData ? "secondary" : "ghost"} className="h-8" onClick={() => setShowData((v) => !v)} aria-pressed={showData}>
            <CodeIcon /> Data
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={restart}>
            <RotateCcwIcon /> Restart
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-4">
        <div className="grid gap-3">
          <div
            ref={setFrame}
            data-testid="preview-frame"
            className="relative h-[min(780px,calc(100vh-10rem))] w-[375px] overflow-hidden rounded-[2rem] border-[6px] border-zinc-800 bg-background text-foreground shadow-xl"
            style={{ transform: "translateZ(0)" }}
          >
            {normalized.survey && frame ? (
              <PortalContainerProvider value={frame}>
                {outcome ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-lg font-semibold">{outcome.kind === "submitted" ? "Submitted" : "Closed without saving"}</p>
                    <p className="text-sm text-muted-foreground">
                      {outcome.kind === "submitted" ? "This is where the app returns to its home screen. Open Data to see what would be saved." : "The participant tapped the close button (the app receives null)."}
                    </p>
                    <Button onClick={restart}>
                      <RotateCcwIcon /> Start again
                    </Button>
                  </div>
                ) : (
                  <SurveyRunner
                    key={`${run.n}-${lang}`}
                    survey={run.startAt ? { ...normalized.survey, intro: undefined } : normalized.survey}
                    title={name || "Survey"}
                    language={lang}
                    storage={null}
                    fill="container"
                    startAt={run.startAt}
                    onSubmit={(result) => {
                      setOutcome({ kind: "submitted", result })
                      setShowData(true)
                    }}
                    onCancel={() => setOutcome({ kind: "closed" })}
                  />
                )}
              </PortalContainerProvider>
            ) : (
              <div className="p-6 text-sm text-destructive">{normalized.error}</div>
            )}
          </div>
          {showData ? (
            <div className={cn("w-[375px] rounded-lg border bg-background p-3")}>
              <p className="mb-2 text-xs font-medium">Data sent to MindCheck {outcome?.kind === "submitted" ? "" : "(submit the preview to see it)"}</p>
              <pre className="max-h-80 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug" data-testid="preview-data">
                {outcome?.kind === "submitted" ? JSON.stringify(outcome.result, null, 2) : outcome?.kind === "closed" ? "null" : "..."}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})
