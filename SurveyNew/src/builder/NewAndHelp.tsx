import { FilePlus2Icon, LayoutTemplateIcon } from "lucide-react"
import { TEMPLATES } from "@/templates"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { emptySurvey, useBuilder } from "./store"

export function NewSurveyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const load = useBuilder((s) => s.load)
  const hasQuestions = useBuilder((s) => s.survey.questions.length > 0)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Start a new survey</DialogTitle>
          <DialogDescription>
            {hasQuestions ? "This replaces the survey in the editor. Export it first if you want to keep it." : "Start from scratch or from an example."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <button
            type="button"
            className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent"
            onClick={() => {
              load(emptySurvey())
              onOpenChange(false)
            }}
          >
            <FilePlus2Icon className="mt-0.5 size-5 text-muted-foreground" />
            <span className="grid">
              <span className="font-medium">Blank survey</span>
              <span className="text-sm text-muted-foreground">An empty survey with recommended settings.</span>
            </span>
          </button>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent"
              data-testid={`template-${t.id}`}
              onClick={() => {
                load(t.survey, { name: t.name.replace(/ \(.*\)$/, "") })
                onOpenChange(false)
              }}
            >
              <LayoutTemplateIcon className="mt-0.5 size-5 text-muted-foreground" />
              <span className="grid">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-muted-foreground">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick start</DialogTitle>
          <DialogDescription>
            Survey Builder {__BUILD_INFO__.version} - built {__BUILD_INFO__.date}
          </DialogDescription>
        </DialogHeader>
        <ol className="grid list-decimal gap-2 pl-5 text-sm">
          <li>
            <strong>Add questions</strong> with the <em>Add</em> button. Click a question to edit it; drag the handle to reorder.
          </li>
          <li>
            <strong>Branching:</strong> open a question's <em>Logic</em> tab and add a rule, e.g. show "At what time?" only if the previous answer is Yes.
          </li>
          <li>
            <strong>Check it</strong> in the phone preview on the right. <em>Restart</em> starts over; <em>Data</em> shows exactly what is saved.
          </li>
          <li>
            <strong>Settings</strong> (top bar): one question per screen or all on one page, progress bar, colours, welcome/thank-you screens.
          </li>
          <li>
            <strong>Save your work</strong> with <em>Export → Download survey file</em>. The builder also keeps a draft in this browser, but clearing the browser removes it.
          </li>
          <li>
            <strong>Put it in MindCheck:</strong> <em>Server → Connect</em> with your researcher login, then <em>Create on server</em> (first time) or <em>Publish</em> (updates). Without a login, use{" "}
            <em>Export → Download dashboard import file</em> and the dashboard's Import.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">Ask your study coordinator for the full collaborator guide.</p>
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
