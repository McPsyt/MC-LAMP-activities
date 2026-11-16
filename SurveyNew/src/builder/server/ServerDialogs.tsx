import * as React from "react"
import { AlertTriangleIcon, DownloadIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
import { toast } from "sonner"
import type { SurveyDefinition } from "@/survey/schema"
import { hashJson } from "@/survey/hash"
import { convertLegacySurvey, looksLikeLegacySettings } from "@/survey/legacy"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useBuilder, type LinkedActivity } from "../store"
import { Field, downloadText, fileSafeName } from "../ui"
import { bumpVersion, diffSurveys } from "../diff"
import { hasErrors, parseSurveyJson, type Issue } from "../validate"
import {
  DETAILS_KEY,
  HISTORY_KEY,
  HISTORY_LIMIT,
  LampApiError,
  createLampClient,
  isInsecureUrl,
  normalizeServerUrl,
  type ActivitySummary,
  type HistoryDoc,
  type Researcher,
  type Revision,
  type Study,
} from "./lampApi"
import { rememberedServerUrl, useSession } from "./session"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Interpret activity settings from the server as a SurveyNew definition. */
export function settingsToSurvey(settings: unknown, name?: string): SurveyDefinition {
  if (looksLikeLegacySettings(settings)) return convertLegacySurvey(settings, name).survey
  const r = parseSurveyJson(settings)
  if (!r.survey) throw new Error(`The activity's settings aren't a SurveyNew survey (${r.errors[0] ?? "unknown format"}).`)
  return r.survey
}

function useStudies(open: boolean) {
  const client = useSession((s) => s.client)
  const researcherId = useSession((s) => s.researcherId)
  const [studies, setStudies] = React.useState<Study[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open || !client) return
    let live = true
    setStudies(null)
    setError(null)
    ;(researcherId ? client.listStudies(researcherId) : client.listMyStudies())
      .then((s) => live && setStudies(s ?? []))
      .catch((e) => live && setError(message(e)))
    return () => {
      live = false
    }
  }, [open, client, researcherId])
  return { studies, error }
}

function StudySelect({ studies, value, onChange }: { studies: Study[] | null; value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={!studies}>
      <SelectTrigger className="w-full" aria-label="Study">
        <SelectValue placeholder={studies ? (studies.length ? "Choose a study" : "No studies found") : "Loading studies..."} />
      </SelectTrigger>
      <SelectContent>
        {(studies ?? []).map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name || s.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

export function ConnectDialog({ open, onOpenChange, onConnected }: { open: boolean; onOpenChange: (o: boolean) => void; onConnected?: () => void }) {
  const connect = useSession((s) => s.connect)
  const [serverUrl, setServerUrl] = React.useState(() => rememberedServerUrl())
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [remember, setRemember] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [researchers, setResearchers] = React.useState<Researcher[] | null>(null)
  const [researcherId, setResearcherId] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setError(null)
      setResearchers(null)
      setPassword("")
    }
  }, [open])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const creds = { serverUrl: normalizeServerUrl(serverUrl), username: username.trim(), password }
    if (researchers) {
      if (!researcherId) return setError("Choose a researcher to work as.")
      connect(creds, remember, researcherId)
      onOpenChange(false)
      onConnected?.()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const client = createLampClient(creds)
      try {
        await client.listMyStudies()
        connect(creds, remember, null)
        toast.success("Connected")
        onOpenChange(false)
        onConnected?.()
      } catch (err) {
        // Administrator accounts can't use "me": pick a researcher instead.
        if (err instanceof LampApiError && err.code === "400.context-substitution-failed") {
          setResearchers(await client.listResearchers())
        } else throw err
      }
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to MindCheck</DialogTitle>
          <DialogDescription>Sign in with the researcher account you use for the dashboard. Your password is only kept in this browser tab.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <Field label="Server address" htmlFor="srv" hint="The API address, e.g. https://api.your-mindcheck.org (ask your administrator).">
            <Input id="srv" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://..." autoComplete="url" required />
          </Field>
          {serverUrl && isInsecureUrl(serverUrl) ? (
            <Alert variant="destructive">
              <ShieldAlertIcon />
              <AlertTitle>Not encrypted</AlertTitle>
              <AlertDescription>This address starts with http://, so your password would be sent without encryption. Use https:// if possible.</AlertDescription>
            </Alert>
          ) : null}
          <Field label="Email / username" htmlFor="usr">
            <Input id="usr" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required disabled={!!researchers} />
          </Field>
          <Field label="Password" htmlFor="pwd">
            <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required disabled={!!researchers} />
          </Field>
          {researchers ? (
            <Field label="Work as researcher" hint="This is an administrator account; choose which researcher's studies to use.">
              <Select value={researcherId} onValueChange={setResearcherId}>
                <SelectTrigger aria-label="Researcher">
                  <SelectValue placeholder="Choose a researcher" />
                </SelectTrigger>
                <SelectContent>
                  {researchers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name || r.email || r.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
            Stay signed in until I close this tab
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {researchers ? "Continue" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Open from server
// ---------------------------------------------------------------------------

export function OpenFromServerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useSession((s) => s.client)
  const load = useBuilder((s) => s.load)
  const { studies, error: studiesError } = useStudies(open)
  const [studyId, setStudyId] = React.useState("")
  const [surveys, setSurveys] = React.useState<ActivitySummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!client || !studyId) return
    let live = true
    setSurveys(null)
    setError(null)
    client
      .listSurveys(studyId)
      .then((s) => live && setSurveys(s))
      .catch((e) => live && setError(message(e)))
    return () => {
      live = false
    }
  }, [client, studyId])

  const openActivity = async (a: ActivitySummary) => {
    if (!client) return
    setBusyId(a.id)
    setError(null)
    try {
      const full = await client.getActivity(a.id)
      const survey = settingsToSurvey(full.settings, full.name)
      const linked: LinkedActivity = {
        serverUrl: client.baseUrl,
        studyId,
        studyName: studies?.find((s) => s.id === studyId)?.name,
        activityId: a.id,
        activityName: full.name,
        remoteHash: hashJson(full.settings),
        version: survey.version,
      }
      load(survey, { name: full.name }, linked)
      toast.success(`Opened "${full.name}"`)
      onOpenChange(false)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open a survey from MindCheck</DialogTitle>
          <DialogDescription>Edit an existing SurveyNew activity. When you're done, use Publish to update it in place.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Study">
            <StudySelect studies={studies} value={studyId} onChange={setStudyId} />
          </Field>
          {studiesError ? <p className="text-sm text-destructive">{studiesError}</p> : null}
          {studyId ? (
            <ul className="grid max-h-72 gap-1.5 overflow-y-auto" data-testid="server-surveys">
              {surveys === null && !error ? (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" /> Loading...
                </li>
              ) : null}
              {surveys?.length === 0 ? <li className="text-sm text-muted-foreground">No SurveyNew activities in this study yet.</li> : null}
              {surveys?.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <span className="flex-1 truncate font-medium">{a.name}</span>
                  <Button size="sm" onClick={() => openActivity(a)} disabled={!!busyId}>
                    {busyId === a.id ? <Loader2Icon className="animate-spin" /> : null}Open
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

async function readHistory(activityId: string): Promise<Revision[]> {
  const client = useSession.getState().client
  if (!client) return []
  const doc = await client.getAttachment<HistoryDoc>(activityId, HISTORY_KEY)
  return Array.isArray(doc?.revisions) ? doc!.revisions : []
}

// ---------------------------------------------------------------------------
// Create on server
// ---------------------------------------------------------------------------

export function CreateOnServerDialog({ open, onOpenChange, issues }: { open: boolean; onOpenChange: (o: boolean) => void; issues: Issue[] }) {
  const client = useSession((s) => s.client)
  const creds = useSession((s) => s.creds)
  const survey = useBuilder((s) => s.survey)
  const meta = useBuilder((s) => s.meta)
  const { setMeta, setLinked, change } = useBuilder.getState()
  const { studies, error: studiesError } = useStudies(open)
  const [studyId, setStudyId] = React.useState("")
  const [category, setCategory] = React.useState("assess")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const blocked = hasErrors(issues)

  const create = async () => {
    if (!client || !studyId || !meta.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const settings: SurveyDefinition = { ...survey, version: survey.version || "1" }
      const id = await client.createActivity(studyId, { name: meta.name.trim(), settings, category: [category] })
      await client.setAttachment(id, DETAILS_KEY, { description: meta.description ?? "", photo: null, streak: null, visualSettings: null, showFeed: null })
      try {
        await client.setAttachment(id, HISTORY_KEY, {
          revisions: [{ version: settings.version, publishedAt: Date.now(), publishedBy: creds?.username, note: "Created from the survey builder", settings }],
        } satisfies HistoryDoc)
      } catch {
        /* history is best-effort on create */
      }
      if (settings.version !== survey.version) change((s) => ({ ...s, version: settings.version }))
      setLinked({
        serverUrl: client.baseUrl,
        studyId,
        studyName: studies?.find((s) => s.id === studyId)?.name,
        activityId: id,
        activityName: meta.name.trim(),
        remoteHash: hashJson(settings),
        version: settings.version,
      })
      toast.success("Created in MindCheck", { description: "Set its schedule in the dashboard. It appears there after the page reloads." })
      onOpenChange(false)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create in MindCheck</DialogTitle>
          <DialogDescription>Adds this survey as a new activity in a study. Afterwards, Publish updates the same activity.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {blocked ? <p className="text-sm text-destructive">Fix the problems listed under “Check” first.</p> : null}
          <Field label="Activity name" htmlFor="new-name">
            <Input id="new-name" value={meta.name} onChange={(e) => setMeta({ name: e.target.value })} placeholder="e.g. Morning check-in" />
          </Field>
          <Field label="Study">
            <StudySelect studies={studies} value={studyId} onChange={setStudyId} />
          </Field>
          {studiesError ? <p className="text-sm text-destructive">{studiesError}</p> : null}
          <Field label="App tab" hint="Where participants find it in the app.">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="App tab">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assess">Assess</SelectItem>
                <SelectItem value="learn">Learn</SelectItem>
                <SelectItem value="manage">Manage</SelectItem>
                <SelectItem value="prevent">Prevent</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={create} disabled={busy || blocked || !studyId || !meta.name.trim()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}Create activity
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Publish (update in place)
// ---------------------------------------------------------------------------

type Stage =
  | { kind: "checking" }
  | { kind: "conflict"; remote: unknown }
  | { kind: "ready"; remote: unknown }
  | { kind: "publishing" }
  | { kind: "historyFailed"; remote: unknown; error: string }
  | { kind: "error"; error: string }

export function PublishDialog({ open, onOpenChange, issues }: { open: boolean; onOpenChange: (o: boolean) => void; issues: Issue[] }) {
  const client = useSession((s) => s.client)
  const creds = useSession((s) => s.creds)
  const survey = useBuilder((s) => s.survey)
  const linked = useBuilder((s) => s.linked)
  const { load, setLinked, change } = useBuilder.getState()
  const [stage, setStage] = React.useState<Stage>({ kind: "checking" })
  const [version, setVersion] = React.useState("")
  const [note, setNote] = React.useState("")
  const [overwrite, setOverwrite] = React.useState(false)
  const blocked = hasErrors(issues)

  const check = React.useCallback(async () => {
    if (!client || !linked) return
    setStage({ kind: "checking" })
    try {
      const remote = await client.getActivity(linked.activityId)
      const remoteSurvey = (() => {
        try {
          return settingsToSurvey(remote.settings)
        } catch {
          return null
        }
      })()
      setVersion(bumpVersion(remoteSurvey?.version ?? survey.version))
      setStage(hashJson(remote.settings) !== linked.remoteHash && !overwrite ? { kind: "conflict", remote: remote.settings } : { kind: "ready", remote: remote.settings })
    } catch (e) {
      setStage({ kind: "error", error: message(e) })
    }
  }, [client, linked, survey.version, overwrite])

  React.useEffect(() => {
    if (open) {
      setNote("")
      setOverwrite(false)
      void check()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!linked) return null
  const remoteSurvey = stage.kind === "ready" || stage.kind === "conflict" || stage.kind === "historyFailed" ? safeSurvey(stage.remote) : null
  const diff = stage.kind === "ready" ? diffSurveys(remoteSurvey, survey) : null

  const publish = async (skipHistory = false) => {
    if (!client || stage.kind === "checking" || stage.kind === "publishing" || stage.kind === "error") return
    const remote = "remote" in stage ? stage.remote : undefined
    const settings: SurveyDefinition = { ...survey, version }
    setStage({ kind: "publishing" })
    try {
      if (!skipHistory) {
        try {
          const history = await readHistory(linked.activityId)
          const revisions = [...history]
          if (revisions.length === 0 && remote) {
            revisions.push({ version: safeSurvey(remote)?.version, publishedAt: 0, note: "Version on the server before the first publish from the builder", settings: remote })
          }
          revisions.push({ version, publishedAt: Date.now(), publishedBy: creds?.username, settings, ...(note ? { note } : {}) })
          await client.setAttachment(linked.activityId, HISTORY_KEY, { revisions: revisions.slice(-HISTORY_LIMIT) })
        } catch (e) {
          setStage({ kind: "historyFailed", remote, error: message(e) })
          return
        }
      }
      await client.updateSettings(linked.activityId, settings)
      const saved = await client.getActivity(linked.activityId)
      if (hashJson(saved.settings) !== hashJson(settings)) throw new Error("The server saved something different from what was sent. Please reload and check.")
      change((s) => ({ ...s, version }))
      setLinked({ ...linked, remoteHash: hashJson(settings), version })
      toast.success(`Published version ${version}`, { description: "Participants get it the next time they open the survey." })
      onOpenChange(false)
    } catch (e) {
      setStage({ kind: "error", error: message(e) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish “{linked.activityName}”</DialogTitle>
          <DialogDescription>
            Updates the questions of this activity in place on {linked.serverUrl}. Its schedule, name and past responses are not changed.
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <Alert variant="destructive">
            <AlertTitle>Fix the problems first</AlertTitle>
            <AlertDescription>Open “Check” in the top bar to see what needs fixing.</AlertDescription>
          </Alert>
        ) : null}
        {stage.kind === "checking" || stage.kind === "publishing" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> {stage.kind === "checking" ? "Checking the current version on the server..." : "Publishing..."}
          </p>
        ) : null}
        {stage.kind === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn't publish</AlertTitle>
            <AlertDescription>{stage.error}</AlertDescription>
          </Alert>
        ) : null}
        {stage.kind === "conflict" ? (
          <Alert>
            <AlertTriangleIcon />
            <AlertTitle>Changed on the server</AlertTitle>
            <AlertDescription className="grid gap-2">
              <p>Someone (or another tab) published changes to this survey after you opened it. Publishing now would replace their changes.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const s = safeSurvey(stage.remote)
                    if (s) load(s, { name: linked.activityName }, { ...linked, remoteHash: hashJson(stage.remote), version: s.version })
                    onOpenChange(false)
                  }}
                >
                  Load the server version (discard mine)
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setOverwrite(true)
                    setStage({ kind: "ready", remote: stage.remote })
                  }}
                >
                  Keep mine and review
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {stage.kind === "historyFailed" ? (
          <Alert variant="destructive">
            <AlertTitle>Version history couldn't be saved</AlertTitle>
            <AlertDescription className="grid gap-2">
              <p>{stage.error} Nothing was published.</p>
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() => {
                  downloadText(`${fileSafeName(linked.activityName)}-backup-before-publish.json`, JSON.stringify(stage.remote, null, 2))
                  void publish(true)
                }}
              >
                <DownloadIcon /> Download backup & publish anyway
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {stage.kind === "ready" && diff ? (
          <div className="grid gap-3" data-testid="publish-summary">
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-1 font-medium">Changes since the server version {remoteSurvey?.version ? `(v${remoteSurvey.version})` : ""}</p>
              {diff.identical ? <p className="text-muted-foreground">No changes.</p> : null}
              <ul className="grid gap-0.5 text-muted-foreground">
                {diff.added.length ? <li>Added: {diff.added.join(", ")}</li> : null}
                {diff.removed.length ? <li>Removed: {diff.removed.join(", ")}</li> : null}
                {diff.changed.map((c) => (
                  <li key={c.id}>
                    Edited {c.id}: {c.what.join(", ")}
                  </li>
                ))}
                {diff.settingsChanged.length ? <li>Survey settings: {diff.settingsChanged.join(", ")}</li> : null}
              </ul>
            </div>
            {diff.breaking.length ? (
              <Alert>
                <AlertTriangleIcon />
                <AlertTitle>
                  {diff.breaking.length} change{diff.breaking.length === 1 ? "" : "s"} may affect data analysis
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {diff.breaking.map((b, i) => (
                      <li key={i}>
                        <span className="font-mono">{b.id}</span>: {b.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">Responses record the survey version, so you can tell old and new answers apart.</p>
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pub-version">New version</Label>
                <Input id="pub-version" value={version} onChange={(e) => setVersion(e.target.value)} className="font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pub-note">What changed? (optional)</Label>
                <Textarea id="pub-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Saved in the version history" />
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void publish()} disabled={blocked || stage.kind !== "ready" || !version.trim() || (!!diff?.identical && !overwrite)}>
            Publish version {version}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function safeSurvey(settings: unknown): SurveyDefinition | null {
  try {
    return settingsToSurvey(settings)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const linked = useBuilder((s) => s.linked)
  const change = useBuilder((s) => s.change)
  const [revisions, setRevisions] = React.useState<Revision[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !linked) return
    setRevisions(null)
    setError(null)
    readHistory(linked.activityId)
      .then((r) => setRevisions([...r].reverse()))
      .catch((e) => setError(message(e)))
  }, [open, linked])

  if (!linked) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>The last {HISTORY_LIMIT} published versions of “{linked.activityName}”. Load one into the editor, then Publish to restore it.</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {revisions === null && !error ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading...
          </p>
        ) : null}
        {revisions?.length === 0 ? <p className="text-sm text-muted-foreground">No versions published from the builder yet.</p> : null}
        <ul className="grid gap-2" data-testid="history-list">
          {revisions?.map((r, i) => (
            <li key={i} className="grid gap-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">v{r.version ?? "?"}</Badge>
                <span className="text-muted-foreground">{r.publishedAt ? new Date(r.publishedAt).toLocaleString() : "before builder"}</span>
                {i === 0 ? <Badge>current</Badge> : null}
              </div>
              {r.publishedBy ? <p className="text-xs text-muted-foreground">by {r.publishedBy}</p> : null}
              {r.note ? <p className="text-xs">{r.note}</p> : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const s = safeSurvey(r.settings)
                    if (!s) return toast.error("This version can't be opened.")
                    change(() => s)
                    toast.success(`Loaded v${r.version ?? "?"} into the editor`, { description: "Publish to make it live again." })
                    onOpenChange(false)
                  }}
                >
                  Load into editor
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadText(`${fileSafeName(linked.activityName)}-v${r.version ?? i}.survey.json`, JSON.stringify(r.settings, null, 2))}>
                  <DownloadIcon /> Download
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
