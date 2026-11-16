import * as React from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useBuilder } from "./store"
import { TopBar, type DialogName } from "./TopBar"
import { Outline } from "./Outline"
import { QuestionEditor } from "./QuestionEditor"
import { Preview, type PreviewHandle } from "./Preview"
import { SettingsSheet } from "./SettingsSheet"
import { AlertsDialog, ScoresDialog } from "./ScoresAlerts"
import { LanguagesDialog } from "./LanguagesDialog"
import { ExportDialog, ImportDialog } from "./ImportExport"
import { HelpDialog, NewSurveyDialog } from "./NewAndHelp"
import { ConnectDialog, CreateOnServerDialog, HistoryDialog, OpenFromServerDialog, PublishDialog } from "./server/ServerDialogs"
import { useSession } from "./server/session"
import { validateSurvey } from "./validate"

function useMediaQuery(q: string) {
  const [m, setM] = React.useState(() => window.matchMedia?.(q).matches ?? true)
  React.useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const on = () => setM(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [q])
  return m
}

export function BuilderApp({ firstRun }: { firstRun: boolean }) {
  const survey = useBuilder((s) => s.survey)
  const issues = React.useMemo(() => validateSurvey(survey), [survey])
  const [dialog, setDialog] = React.useState<DialogName | null>(firstRun ? "new" : null)
  const [pendingAfterConnect, setPendingAfterConnect] = React.useState<DialogName | null>(null)
  const [pane, setPane] = React.useState<"questions" | "edit" | "preview">("edit")
  const wide = useMediaQuery("(min-width: 1100px)")
  const preview = React.useRef<PreviewHandle>(null)
  const connected = useSession((s) => !!s.client)

  const open = (d: DialogName) => {
    if ((d === "open" || d === "create" || d === "publish" || d === "history") && !connected) {
      setPendingAfterConnect(d)
      setDialog("connect")
      return
    }
    setDialog(d)
  }
  const dialogProps = (d: DialogName) => ({ open: dialog === d, onOpenChange: (o: boolean) => setDialog(o ? d : null) })

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === "z" && !e.shiftKey) {
        e.preventDefault()
        useBuilder.getState().undo()
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault()
        useBuilder.getState().redo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const previewFrom = (id: string) => {
    preview.current?.restart(id)
    if (!wide) setPane("preview")
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <TopBar issues={issues} open={open} />
        {!wide ? (
          <div className="border-b px-3 py-2">
            <Tabs value={pane} onValueChange={(v) => setPane(v as typeof pane)}>
              <TabsList className="w-full">
                <TabsTrigger value="questions">Questions</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        ) : null}
        <div className={cn("min-h-0 flex-1", wide && "grid grid-cols-[18rem_minmax(0,1fr)_27rem]")}>
          <aside className={cn("min-h-0 border-r", wide ? "block" : pane === "questions" ? "h-full" : "hidden")} onClick={() => !wide && setPane("edit")}>
            <Outline issues={issues} />
          </aside>
          <main className={cn("min-h-0 overflow-y-auto", wide ? "block" : pane === "edit" ? "h-full" : "hidden")}>
            <div className="mx-auto max-w-3xl">
              <QuestionEditor issues={issues} onPreviewFrom={previewFrom} />
            </div>
          </main>
          <section className={cn("min-h-0 border-l", wide ? "block" : pane === "preview" ? "h-full" : "hidden")} aria-label="Preview">
            <Preview ref={preview} />
          </section>
        </div>
      </div>

      <NewSurveyDialog {...dialogProps("new")} />
      <ImportDialog {...dialogProps("import")} />
      <ExportDialog {...dialogProps("export")} issues={issues} />
      <SettingsSheet {...dialogProps("settings")} />
      <ScoresDialog {...dialogProps("scores")} />
      <AlertsDialog {...dialogProps("alerts")} />
      <LanguagesDialog {...dialogProps("languages")} issues={issues} />
      <HelpDialog {...dialogProps("help")} />
      <ConnectDialog
        {...dialogProps("connect")}
        onConnected={() => {
          if (pendingAfterConnect) setTimeout(() => setDialog(pendingAfterConnect), 0)
          setPendingAfterConnect(null)
        }}
      />
      <OpenFromServerDialog {...dialogProps("open")} />
      <CreateOnServerDialog {...dialogProps("create")} issues={issues} />
      <PublishDialog {...dialogProps("publish")} issues={issues} />
      <HistoryDialog {...dialogProps("history")} />
      <Toaster position="bottom-center" richColors closeButton />
    </TooltipProvider>
  )
}
