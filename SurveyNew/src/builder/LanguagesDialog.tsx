import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { UI_LANGUAGES } from "@/survey/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useBuilder } from "./store"
import type { Issue } from "./validate"

const COMMON = Object.entries(UI_LANGUAGES).map(([code, v]) => ({ code, label: v.label }))
export const languageLabel = (code: string) => UI_LANGUAGES[code]?.label ?? code

export function LanguagesDialog({ open, onOpenChange, issues }: { open: boolean; onOpenChange: (o: boolean) => void; issues: Issue[] }) {
  const survey = useBuilder((s) => s.survey)
  const { change, setEditLang } = useBuilder.getState()
  const editLang = useBuilder((s) => s.editLang)
  const def = survey.defaultLanguage ?? "en"
  const langs = survey.languages?.length ? survey.languages : [def]
  const [custom, setCustom] = React.useState("")
  const missing = (l: string) => issues.find((i) => i.area === "languages" && i.message.includes(`"${l}"`))?.message.match(/^\d+/)?.[0]

  const add = (code: string) => {
    const c = code.trim()
    if (!c || langs.includes(c)) return
    change((s) => ({ ...s, languages: [...langs, c] }))
  }
  const remove = (code: string) => {
    change((s) => ({ ...s, languages: langs.filter((l) => l !== code) }))
    if (editLang === code) setEditLang(def)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Languages</DialogTitle>
          <DialogDescription>
            Participants see the survey in their app language when a translation exists, otherwise in the default language. Buttons and messages are translated automatically for English, French,
            Spanish, German, Danish, Italian, Hindi, Korean and Chinese.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ul className="grid gap-2">
            {langs.map((l) => (
              <li key={l} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">{languageLabel(l)}</span>
                <span className="font-mono text-xs text-muted-foreground">{l}</span>
                {l === def ? <Badge>Default</Badge> : missing(l) ? <Badge variant="outline">{missing(l)} missing</Badge> : <Badge variant="secondary">Complete</Badge>}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant={editLang === l ? "secondary" : "ghost"} onClick={() => setEditLang(l)}>
                    {editLang === l ? "Editing" : "Edit"}
                  </Button>
                  {l !== def ? (
                    <Button size="sm" variant="ghost" onClick={() => change((s) => ({ ...s, defaultLanguage: l }))}>
                      Make default
                    </Button>
                  ) : null}
                  {l !== def ? (
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${l}`} onClick={() => remove(l)}>
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Select value="" onValueChange={add}>
              <SelectTrigger className="w-56" aria-label="Add language">
                <SelectValue placeholder="Add a language" />
              </SelectTrigger>
              <SelectContent>
                {COMMON.filter((c) => !langs.includes(c.code)).map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">or code</span>
            <Input className="w-24" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="pt" aria-label="Language code" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                add(custom)
                setCustom("")
              }}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Removing a language keeps its translations in the file; they are just not offered.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
