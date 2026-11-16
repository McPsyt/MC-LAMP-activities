import { create } from "zustand"
import type { Condition, Question, QuestionType, SurveyDefinition } from "@/survey/schema"
import { SCHEMA_VERSION } from "@/survey/schema"
import { convertType, newQuestion } from "./questionTypes"
import { uniqueId } from "./lstring"

export interface DocMeta {
  /** Activity name used for dashboard export / Create on server. */
  name: string
  description: string
}

/** Link to an activity on a LAMP server (no credentials are ever stored). */
export interface LinkedActivity {
  serverUrl: string
  studyId: string
  studyName?: string
  activityId: string
  activityName: string
  /** Hash of the settings as last loaded from / published to the server (conflict detection). */
  remoteHash: string
  version?: string
}

export interface BuilderState {
  survey: SurveyDefinition
  meta: DocMeta
  linked: LinkedActivity | null
  selectedId: string | null
  editLang: string
  past: SurveyDefinition[]
  future: SurveyDefinition[]
  lastCoalesce: { key: string; at: number } | null

  /** Apply a change. `coalesce` merges rapid edits of the same field into one undo step. */
  change: (fn: (s: SurveyDefinition) => SurveyDefinition, coalesce?: string) => void
  updateQuestion: (id: string, patch: Partial<Question> | ((q: Question) => Question), coalesce?: string) => void
  addQuestion: (type: QuestionType, afterId?: string | null) => string
  duplicateQuestion: (id: string) => void
  removeQuestion: (id: string) => void
  moveQuestion: (from: number, to: number) => void
  renameQuestion: (oldId: string, newId: string) => void
  changeType: (id: string, type: QuestionType) => void
  select: (id: string | null) => void
  setEditLang: (lang: string) => void
  setMeta: (patch: Partial<DocMeta>) => void
  setLinked: (linked: LinkedActivity | null) => void
  load: (survey: SurveyDefinition, meta?: Partial<DocMeta>, linked?: LinkedActivity | null) => void
  undo: () => void
  redo: () => void
}

export const DRAFT_KEY = "surveynew-builder-draft-v1"

export function emptySurvey(): SurveyDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    version: "1",
    defaultLanguage: "en",
    languages: ["en"],
    options: {
      layout: "question",
      showProgress: true,
      showQuestionNumbers: false,
      allowBackNavigation: true,
      autoAdvance: false,
      confirmExit: true,
      resume: { enabled: true, expiresAfterHours: 12 },
    },
    appearance: { theme: "zinc", mode: "light", radius: "md" },
    questions: [],
  }
}

const HISTORY_LIMIT = 100
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Rewrite question references in a condition (used when an id is renamed). */
function renameInCondition(c: Condition | undefined, oldId: string, newId: string): Condition | undefined {
  if (!c) return c
  if ("all" in c) return { all: c.all.map((x) => renameInCondition(x, oldId, newId)!) }
  if ("any" in c) return { any: c.any.map((x) => renameInCondition(x, oldId, newId)!) }
  if ("not" in c) return { not: renameInCondition(c.not, oldId, newId)! }
  if ("question" in c) {
    const [head, ...rest] = c.question.split(".")
    if (head === oldId) return { ...c, question: [newId, ...rest].join(".") }
  }
  return c
}

function renameInText<T>(text: T, oldId: string, newId: string): T {
  const re = new RegExp(`\\{\\{\\s*${oldId}(\\.[A-Za-z0-9_]+)?\\s*\\}\\}`, "g")
  const fix = (s: string) => s.replace(re, (_m, suffix: string | undefined) => `{{${newId}${suffix ?? ""}}}`)
  if (typeof text === "string") return fix(text) as T
  if (text && typeof text === "object") {
    return Object.fromEntries(Object.entries(text as Record<string, string>).map(([k, v]) => [k, typeof v === "string" ? fix(v) : v])) as T
  }
  return text
}

export const useBuilder = create<BuilderState>()((set, get) => ({
  survey: emptySurvey(),
  meta: { name: "", description: "" },
  linked: null,
  selectedId: null,
  editLang: "en",
  past: [],
  future: [],
  lastCoalesce: null,

  change: (fn, coalesce) => {
    const { survey, past, lastCoalesce } = get()
    const now = Date.now()
    const merge = !!coalesce && lastCoalesce?.key === coalesce && now - lastCoalesce.at < 1500
    const next = fn(clone(survey))
    set({
      survey: next,
      past: merge ? past : [...past, survey].slice(-HISTORY_LIMIT),
      future: [],
      lastCoalesce: coalesce ? { key: coalesce, at: now } : null,
    })
  },

  updateQuestion: (id, patch, coalesce) =>
    get().change((s) => {
      s.questions = s.questions.map((q) => (q.id === id ? (typeof patch === "function" ? patch(q) : ({ ...q, ...patch } as Question)) : q))
      return s
    }, coalesce),

  addQuestion: (type, afterId) => {
    const taken = new Set(get().survey.questions.map((q) => q.id))
    const prefix = type === "section" ? "section" : type === "info" ? "info" : "q"
    let n = 1
    while (taken.has(`${prefix}${n}`)) n++
    const id = `${prefix}${n}`
    const q = newQuestion(type, id)
    get().change((s) => {
      const idx = afterId ? s.questions.findIndex((x) => x.id === afterId) : -1
      if (idx >= 0) s.questions.splice(idx + 1, 0, q)
      else s.questions.push(q)
      return s
    })
    set({ selectedId: id })
    return id
  },

  duplicateQuestion: (id) => {
    const { survey } = get()
    const q = survey.questions.find((x) => x.id === id)
    if (!q) return
    const copy = clone(q)
    copy.id = uniqueId(`${id}_copy`, new Set(survey.questions.map((x) => x.id)))
    get().change((s) => {
      s.questions.splice(s.questions.findIndex((x) => x.id === id) + 1, 0, copy)
      return s
    })
    set({ selectedId: copy.id })
  },

  removeQuestion: (id) => {
    const { survey, selectedId } = get()
    const idx = survey.questions.findIndex((q) => q.id === id)
    get().change((s) => {
      s.questions = s.questions.filter((q) => q.id !== id)
      return s
    })
    if (selectedId === id) {
      const rest = get().survey.questions
      set({ selectedId: rest[Math.min(idx, rest.length - 1)]?.id ?? null })
    }
  },

  moveQuestion: (from, to) =>
    get().change((s) => {
      if (to < 0 || to >= s.questions.length) return s
      const [q] = s.questions.splice(from, 1)
      s.questions.splice(to, 0, q)
      return s
    }),

  renameQuestion: (oldId, newId) => {
    if (oldId === newId) return
    get().change((s) => {
      s.questions = s.questions.map((q) => ({
        ...(q.id === oldId ? { ...q, id: newId } : q),
        text: renameInText(q.text, oldId, newId),
        description: renameInText(q.description, oldId, newId),
        showIf: renameInCondition(q.showIf, oldId, newId),
        endSurveyIf: renameInCondition(q.endSurveyIf, oldId, newId),
      })) as Question[]
      s.scores = s.scores?.map((sc) => ({
        ...sc,
        questions: sc.questions.map((r) => (r === oldId || r.startsWith(`${oldId}.`) ? newId + r.slice(oldId.length) : r)),
      }))
      s.alerts = s.alerts?.map((a) => ({ ...a, when: renameInCondition(a.when, oldId, newId)!, message: renameInText(a.message, oldId, newId) }))
      return s
    })
    if (get().selectedId === oldId) set({ selectedId: newId })
  },

  changeType: (id, type) => get().updateQuestion(id, (q) => convertType(q, type)),

  select: (id) => set({ selectedId: id }),
  setEditLang: (lang) => set({ editLang: lang }),
  setMeta: (patch) => set({ meta: { ...get().meta, ...patch } }),
  setLinked: (linked) => set({ linked }),

  load: (survey, meta, linked = null) =>
    set({
      survey: clone(survey),
      meta: { name: meta?.name ?? "", description: meta?.description ?? "" },
      linked,
      selectedId: survey.questions[0]?.id ?? null,
      editLang: survey.defaultLanguage ?? "en",
      past: [],
      future: [],
      lastCoalesce: null,
    }),

  undo: () => {
    const { past, future, survey } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ survey: prev, past: past.slice(0, -1), future: [survey, ...future], lastCoalesce: null })
    fixSelection()
  },
  redo: () => {
    const { past, future, survey } = get()
    if (!future.length) return
    const [next, ...rest] = future
    set({ survey: next, past: [...past, survey], future: rest, lastCoalesce: null })
    fixSelection()
  },
}))

function fixSelection() {
  const { survey, selectedId } = useBuilder.getState()
  if (selectedId && !survey.questions.some((q) => q.id === selectedId)) {
    useBuilder.setState({ selectedId: survey.questions[0]?.id ?? null })
  }
}

// ---------------------------------------------------------------------------
// Draft autosave (browser storage; never contains credentials)
// ---------------------------------------------------------------------------

interface Draft {
  survey: SurveyDefinition
  meta: DocMeta
  linked: LinkedActivity | null
  savedAt: number
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function writeDraft() {
  const state = useBuilder.getState()
  try {
    const draft: Draft = { survey: state.survey, meta: state.meta, linked: state.linked, savedAt: Date.now() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* storage full or blocked */
  }
}

/** Save the draft shortly after each change, and immediately when the tab is hidden or closed. */
export function startAutosave() {
  let dirty = false
  const flush = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (dirty) writeDraft()
    dirty = false
  }
  const unsub = useBuilder.subscribe((state, prev) => {
    if (state.survey === prev.survey && state.meta === prev.meta && state.linked === prev.linked) return
    dirty = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 300)
  })
  const onHide = () => document.visibilityState === "hidden" && flush()
  window.addEventListener("pagehide", flush)
  document.addEventListener("visibilitychange", onHide)
  return () => {
    flush()
    unsub()
    window.removeEventListener("pagehide", flush)
    document.removeEventListener("visibilitychange", onHide)
  }
}
