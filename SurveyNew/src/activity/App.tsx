import * as React from "react"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import type { NormalizedSurvey } from "@/survey/schema"
import { normalizeSurvey } from "@/survey/normalize"
import { makeTranslator } from "@/survey/i18n"
import { SurveyRunner } from "@/renderer/SurveyRunner"
import { applyAppearance } from "@/renderer/theme"
import { progressKey } from "@/renderer/progress"
import { Button } from "@/components/ui/button"
import { sendCancel, sendResult, subscribe, type HostPayload } from "./bridge"

function useHostPayload(): HostPayload | null {
  const [payload, setPayload] = React.useState<HostPayload | null>(null)
  React.useEffect(() => subscribe(setPayload), [])
  return payload
}

function Waiting() {
  return (
    <div className="flex h-dvh items-center justify-center text-muted-foreground" role="status" aria-label="Loading">
      <Loader2Icon className="size-6 animate-spin" />
    </div>
  )
}

function Problem({ language, noBack }: { language: string; noBack: boolean }) {
  const t = makeTranslator(language)
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertCircleIcon className="size-10 text-destructive" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-muted-foreground">{t("errorBody")}</p>
      {!noBack ? (
        <Button className="mt-2 h-11 px-6" onClick={sendCancel}>
          {t("close")}
        </Button>
      ) : null}
    </div>
  )
}

export function App() {
  const payload = useHostPayload()
  const survey = React.useMemo<NormalizedSurvey | null | "error">(() => {
    if (!payload) return null
    try {
      return normalizeSurvey(payload.activity.settings)
    } catch {
      return "error"
    }
  }, [payload])

  React.useEffect(() => {
    if (survey && survey !== "error") applyAppearance(document.documentElement, survey.appearance)
  }, [survey])

  if (!payload || !survey) return <Waiting />
  if (survey === "error") return <Problem language={payload.language} noBack={payload.noBack} />

  return (
    <SurveyRunner
      // Re-mount if the host relaunches with a different activity.
      key={payload.activity.id ?? "survey"}
      survey={survey}
      title={payload.activity.name}
      language={payload.language}
      noBack={payload.noBack}
      storageKey={payload.activity.id ? progressKey(payload.activity.id) : null}
      onSubmit={sendResult}
      onCancel={sendCancel}
    />
  )
}
