import * as React from "react"
import {
  AlertCircleIcon,
  BellRingIcon,
  CalculatorIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CloudIcon,
  CloudUploadIcon,
  FileIcon,
  HelpCircleIcon,
  LanguagesIcon,
  LinkIcon,
  Redo2Icon,
  SettingsIcon,
  Undo2Icon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useBuilder } from "./store"
import { useSession } from "./server/session"
import { languageLabel } from "./LanguagesDialog"
import type { Issue } from "./validate"

export type DialogName =
  | "new"
  | "import"
  | "export"
  | "settings"
  | "scores"
  | "alerts"
  | "languages"
  | "help"
  | "connect"
  | "open"
  | "create"
  | "publish"
  | "history"

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function TopBar({ issues, open }: { issues: Issue[]; open: (d: DialogName) => void }) {
  const meta = useBuilder((s) => s.meta)
  const linked = useBuilder((s) => s.linked)
  const canUndo = useBuilder((s) => s.past.length > 0)
  const canRedo = useBuilder((s) => s.future.length > 0)
  const languages = useBuilder((s) => s.survey.languages ?? [s.survey.defaultLanguage ?? "en"])
  const editLang = useBuilder((s) => s.editLang)
  const { undo, redo, setEditLang, select } = useBuilder.getState()
  const session = useSession()
  const connected = !!session.client
  const errors = issues.filter((i) => i.level === "error")
  const warnings = issues.filter((i) => i.level === "warning")

  const goTo = (i: Issue) => {
    if (i.questionId) select(i.questionId)
    else if (i.area === "scores") open("scores")
    else if (i.area === "alerts") open("alerts")
    else if (i.area === "languages") open("languages")
    else if (i.area === "settings") open("settings")
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-background px-2 sm:gap-2 sm:px-3">
      <div className="mr-1 flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">S</span>
        <div className="hidden min-w-0 sm:grid">
          <span className="truncate text-sm font-semibold leading-tight">{meta.name || "Untitled survey"}</span>
          {linked ? (
            <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground" title={`${linked.serverUrl} - ${linked.studyName ?? linked.studyId}`}>
              <LinkIcon className="size-3" /> {linked.studyName ?? "study"} · v{linked.version ?? "?"}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Survey Builder</span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <FileIcon /> File <ChevronDownIcon className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => open("new")}>New survey / template...</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("import")}>Import / open file...</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("export")}>Export...</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <CloudIcon /> Server <ChevronDownIcon className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {connected ? `Signed in as ${session.creds?.username}` : "Not connected"}
          </DropdownMenuLabel>
          {connected ? (
            <DropdownMenuItem onSelect={() => session.disconnect()}>Sign out</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => open("connect")}>Connect...</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!connected} onSelect={() => open("open")}>
            Open from server...
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!connected} onSelect={() => open("create")}>
            Create on server...
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!connected || !linked} onSelect={() => open("publish")}>
            Publish update...
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!connected || !linked} onSelect={() => open("history")}>
            Version history...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 hidden h-6 w-px bg-border md:block" />
      <IconButton label="Survey settings" onClick={() => open("settings")}>
        <SettingsIcon />
      </IconButton>
      <IconButton label="Scores" onClick={() => open("scores")}>
        <CalculatorIcon />
      </IconButton>
      <IconButton label="Alerts" onClick={() => open("alerts")}>
        <BellRingIcon />
      </IconButton>
      <IconButton label="Languages" onClick={() => open("languages")}>
        <LanguagesIcon />
      </IconButton>
      {languages.length > 1 ? (
        <Select value={editLang} onValueChange={setEditLang}>
          <SelectTrigger size="sm" className="h-8 w-44" aria-label="Editing language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>
                Editing: {languageLabel(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2Icon />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2Icon />
        </IconButton>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="check-button">
              {errors.length ? <AlertCircleIcon className="text-destructive" /> : <CheckCircle2Icon className="text-success" />}
              Check
              {errors.length ? <Badge variant="destructive">{errors.length}</Badge> : null}
              {warnings.length ? <Badge variant="secondary">{warnings.length}</Badge> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-96 w-96 overflow-y-auto p-2">
            {issues.length === 0 ? <p className="p-2 text-sm">No problems found.</p> : null}
            <ul className="grid gap-1">
              {issues.map((i, k) => (
                <li key={k}>
                  <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => goTo(i)}>
                    <span className={i.level === "error" ? "font-medium text-destructive" : "font-medium text-warning"}>{i.level === "error" ? "Error" : "Note"}</span>
                    {i.questionId ? <span className="ml-1 font-mono text-xs text-muted-foreground">{i.questionId}</span> : null} {i.message}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        {linked && connected ? (
          <Button size="sm" onClick={() => open("publish")}>
            <CloudUploadIcon /> Publish
          </Button>
        ) : (
          <Button size="sm" onClick={() => open("export")}>
            Export
          </Button>
        )}
        <IconButton label="Help" onClick={() => open("help")}>
          <HelpCircleIcon />
        </IconButton>
      </div>
    </header>
  )
}
