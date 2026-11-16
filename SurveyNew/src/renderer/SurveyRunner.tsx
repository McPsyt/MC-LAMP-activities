import * as React from "react"
import { AlertTriangleIcon, CheckCircle2Icon, ChevronLeftIcon, InfoIcon, OctagonAlertIcon, XIcon } from "lucide-react"
import type { ActivityResult, AlertDefinition, AnswerValue, Answers, NormalizedSurvey, Question } from "@/survey/schema"
import { isDisplayItem } from "@/survey/schema"
import { makeTranslator, resolveText } from "@/survey/i18n"
import { computeVisibility } from "@/survey/visibility"
import { buildPages, locatePage } from "@/survey/pages"
import { computeOptionOrder } from "@/survey/randomize"
import { evaluate } from "@/survey/conditions"
import { pipeText } from "@/survey/piping"
import { buildResult } from "@/survey/payload"
import { questionAnswered, validateQuestion } from "@/survey/values"
import { formatRelativeWhen } from "@/survey/dates"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { Markdown } from "./Markdown"
import { RunnerContext, type RunnerContextValue } from "./context"
import { QuestionView } from "./QuestionView"
import { clearProgress, loadProgress, safeStorage, saveProgress, surveyShapeHash, type SavedProgress } from "./progress"

export interface SurveyRunnerProps {
  survey: NormalizedSurvey
  /** Activity name from the dashboard; used when the survey has no title. */
  title?: string
  language: string
  /** Hide the close button (parent app passes noBack). */
  noBack?: boolean
  /** localStorage key for resume; null/undefined disables saving. */
  storageKey?: string | null
  onSubmit: (result: ActivityResult) => void
  onCancel: () => void
  /** viewport = full screen (activity); container = fill the parent box (builder preview). */
  fill?: "viewport" | "container"
  clock?: () => number
  seed?: number
  /** Override storage (tests). `null` = no storage. */
  storage?: Storage | null
  /** Open at this question (builder "Preview here"); skips the intro and resume prompt. */
  startAt?: string
}

type Phase = "resume" | "intro" | "questions" | "completion"

const AUTO_ADVANCE = new Set(["single", "boolean", "likert", "faces", "rating"])

function AlertIcon({ severity }: { severity: AlertDefinition["severity"] }) {
  if (severity === "critical") return <OctagonAlertIcon className="size-6 text-destructive" />
  if (severity === "warning") return <AlertTriangleIcon className="size-6 text-warning" />
  return <InfoIcon className="size-6 text-primary" />
}

export function SurveyRunner(props: SurveyRunnerProps) {
  const { survey, language, noBack, storageKey, onSubmit, onCancel, fill = "viewport" } = props
  const clock = React.useRef(props.clock ?? Date.now).current
  const storage = React.useMemo(() => (props.storage === undefined ? safeStorage() : props.storage), [props.storage])
  const t = React.useMemo(() => makeTranslator(language), [language])
  const options = survey.options

  const [saved] = React.useState<SavedProgress | null>(() => (props.startAt ? null : loadProgress(storage, storageKey, survey, clock())))
  const [phase, setPhase] = React.useState<Phase>(() => (props.startAt ? "questions" : saved ? "resume" : survey.intro ? "intro" : "questions"))
  const [answers, setAnswers] = React.useState<Answers>({})
  const [startTime, setStartTime] = React.useState(() => clock())
  const [seed, setSeed] = React.useState(() => props.seed ?? Math.floor(Math.random() * 2 ** 31))
  const [pageKey, setPageKey] = React.useState<string | null>(props.startAt ?? null)
  const [resumed, setResumed] = React.useState(false)
  const [showErrors, setShowErrors] = React.useState(false)
  const [direction, setDirection] = React.useState<"forward" | "back">("forward")
  const [alertQueue, setAlertQueue] = React.useState<AlertDefinition[]>([])
  const [exitOpen, setExitOpen] = React.useState(false)
  const [completionResult, setCompletionResult] = React.useState<ActivityResult | null>(null)

  const durations = React.useRef<Record<string, number>>({})
  const pageShownAt = React.useRef(clock())
  const lastInteraction = React.useRef(clock())
  const shownAlerts = React.useRef(new Set<string>())
  const submitPending = React.useRef(false)
  const autoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const vis = React.useMemo(() => computeVisibility(survey, answers), [survey, answers])
  const pages = React.useMemo(() => buildPages(survey, vis.visible), [survey, vis.visible])
  const pageIndex = locatePage(survey, pages, pageKey)
  const page = pageIndex >= 0 ? pages[pageIndex] : undefined
  const isLast = pageIndex === pages.length - 1
  const optionOrder = React.useMemo(() => computeOptionOrder(survey, seed), [survey, seed])

  const text = React.useCallback(
    (s: Parameters<typeof resolveText>[0]) => pipeText(resolveText(s, language, survey.defaultLanguage), survey, vis.effective, language, t),
    [language, survey, vis.effective, t],
  )

  const numbers = React.useMemo(() => {
    const m = new Map<string, number>()
    if (!options.showQuestionNumbers) return m
    let n = 0
    for (const q of survey.questions) if (vis.visible.has(q.id) && !isDisplayItem(q)) m.set(q.id, ++n)
    return m
  }, [survey, vis.visible, options.showQuestionNumbers])

  const pageErrors = React.useCallback(
    (items: Question[]) => {
      const now = new Date(clock())
      const out = new Map<string, string>()
      for (const q of items) {
        const e = validateQuestion(q, vis.effective, t, language, now)
        if (e) out.set(q.id, e)
      }
      return out
    },
    [vis.effective, t, language, clock],
  )
  const errors = React.useMemo(() => (showErrors && page ? pageErrors(page.items) : new Map<string, string>()), [showErrors, page, pageErrors])

  // --- time accounting ------------------------------------------------------
  const answerableOnPage = React.useMemo(() => page?.items.filter((q) => !isDisplayItem(q)) ?? [], [page])
  const accountPageTime = React.useCallback(() => {
    const now = clock()
    if (page) {
      const items = page.items.filter((q) => !isDisplayItem(q))
      if (items.length === 1) durations.current[items[0].id] = (durations.current[items[0].id] ?? 0) + (now - pageShownAt.current)
    }
    pageShownAt.current = now
    lastInteraction.current = now
  }, [page, clock])

  const goToPage = React.useCallback(
    (index: number, dir: "forward" | "back") => {
      const target = pages[index]
      if (!target) return
      accountPageTime()
      setDirection(dir)
      setShowErrors(false)
      setPageKey(target.key)
    },
    [pages, accountPageTime],
  )

  React.useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 })
  }, [page?.key])

  // --- persistence ------------------------------------------------------------
  React.useEffect(() => {
    if (phase !== "questions" || Object.keys(answers).length === 0) return
    saveProgress(storage, storageKey, {
      v: 1,
      hash: surveyShapeHash(survey),
      savedAt: clock(),
      startTime,
      seed,
      answers,
      pageKey: page?.key ?? null,
      durations: durations.current,
    })
  }, [answers, page?.key, phase, storage, storageKey, survey, startTime, seed, clock])

  // --- immediate alerts -------------------------------------------------------
  React.useEffect(() => {
    if (phase !== "questions") return
    const ctx = { answers: vis.effective, scores: vis.scores }
    const fresh = survey.alerts.filter((a) => a.timing === "immediate" && !shownAlerts.current.has(a.id) && evaluate(a.when, ctx))
    if (fresh.length) {
      fresh.forEach((a) => shownAlerts.current.add(a.id))
      setAlertQueue((q) => [...q, ...fresh])
    }
  }, [vis, survey.alerts, phase])

  // --- submit -----------------------------------------------------------------
  const finalize = React.useCallback(() => {
    const result = buildResult({
      survey,
      answers,
      durations: durations.current,
      startTime,
      now: clock(),
      language,
      optionOrder,
      resumed,
    })
    clearProgress(storage, storageKey)
    const c = survey.completion
    if (c && (c.title || c.body)) {
      setCompletionResult(result)
      setPhase("completion")
    } else {
      onSubmit(result)
    }
  }, [survey, answers, startTime, clock, language, optionOrder, resumed, storage, storageKey, onSubmit])

  const submit = React.useCallback(() => {
    for (let i = 0; i < pages.length; i++) {
      if (pageErrors(pages[i].items).size > 0) {
        if (i !== pageIndex) goToPage(i, i < pageIndex ? "back" : "forward")
        setShowErrors(true)
        return
      }
    }
    accountPageTime()
    const ctx = { answers: vis.effective, scores: vis.scores }
    const atSubmit = survey.alerts.filter((a) => a.timing === "submit" && evaluate(a.when, ctx))
    if (atSubmit.length) {
      submitPending.current = true
      setAlertQueue((q) => [...q, ...atSubmit])
      return
    }
    finalize()
  }, [pages, pageIndex, pageErrors, goToPage, accountPageTime, vis, survey.alerts, finalize])

  const goNext = React.useCallback(() => {
    if (!page) return
    if (pageErrors(page.items).size > 0) {
      setShowErrors(true)
      return
    }
    if (isLast) submit()
    else goToPage(pageIndex + 1, "forward")
  }, [page, pageErrors, isLast, submit, goToPage, pageIndex])

  const goNextRef = React.useRef(goNext)
  goNextRef.current = goNext

  const goBack = () => {
    if (pageIndex > 0) goToPage(pageIndex - 1, "back")
  }

  // Scroll the first invalid question into view after a failed Next/Submit.
  React.useEffect(() => {
    if (!showErrors || errors.size === 0) return
    const id = [...errors.keys()][0]
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-question="${id}"]`)
    el?.scrollIntoView?.({ block: "start", behavior: "smooth" })
    el?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true })
  }, [showErrors, errors])

  React.useEffect(() => () => {
    if (autoTimer.current) clearTimeout(autoTimer.current)
  }, [])

  // --- answers ----------------------------------------------------------------
  const setAnswer = React.useCallback(
    (key: string, value: AnswerValue | undefined) => {
      const now = clock()
      if (answerableOnPage.length > 1) {
        const qid = key.split(".")[0]
        durations.current[qid] = (durations.current[qid] ?? 0) + (now - lastInteraction.current)
      }
      lastInteraction.current = now
      setAnswers((prev) => {
        const next = { ...prev }
        if (value === undefined) delete next[key]
        else next[key] = value
        return next
      })
      if (autoTimer.current) clearTimeout(autoTimer.current)
      const solo = answerableOnPage.length === 1 && page?.items.length === 1 ? answerableOnPage[0] : undefined
      if (
        options.autoAdvance &&
        solo &&
        key === solo.id &&
        AUTO_ADVANCE.has(solo.type) &&
        value != null &&
        !(solo.type === "single" && solo.allowOther && value === "other") &&
        !isLast
      ) {
        autoTimer.current = setTimeout(() => goNextRef.current(), 350)
      }
    },
    [answerableOnPage, page, options.autoAdvance, isLast, clock],
  )

  // --- resume / exit ------------------------------------------------------------
  const resumeChoice = React.useRef(false)
  const doResume = () => {
    resumeChoice.current = true
    if (!saved) return
    setAnswers(saved.answers)
    setSeed(saved.seed)
    setStartTime(saved.startTime)
    durations.current = { ...saved.durations }
    setPageKey(saved.pageKey)
    setResumed(true)
    pageShownAt.current = clock()
    lastInteraction.current = clock()
    setPhase("questions")
  }
  const doStartOver = () => {
    resumeChoice.current = true
    clearProgress(storage, storageKey)
    setStartTime(clock())
    setPhase(survey.intro ? "intro" : "questions")
  }
  const hasAnswers = Object.keys(answers).length > 0
  const requestExit = () => {
    if (options.confirmExit && hasAnswers && phase === "questions") setExitOpen(true)
    else onCancel()
  }

  const ackAlert = () => {
    setAlertQueue((q) => {
      const rest = q.slice(1)
      if (rest.length === 0 && submitPending.current) {
        submitPending.current = false
        queueMicrotask(finalize)
      }
      return rest
    })
  }

  const ctx: RunnerContextValue = {
    survey,
    language,
    t,
    text,
    answers,
    setAnswer,
    optionOrder,
    onEnter: () => goNextRef.current(),
    now: () => new Date(clock()),
  }

  const title = (survey.title ? text(survey.title) : "") || (props.title ?? "").replace(/_/g, " ")

  // --- progress ---------------------------------------------------------------
  let progress = 0
  if (options.layout === "single") {
    const answerable = survey.questions.filter((q) => vis.visible.has(q.id) && !isDisplayItem(q))
    progress = answerable.length ? (answerable.filter((q) => questionAnswered(q, vis.effective)).length / answerable.length) * 100 : 0
  } else if (pages.length) {
    progress = ((pageIndex + 1) / pages.length) * 100
  }

  const alert = alertQueue[0]

  return (
    <RunnerContext.Provider value={ctx}>
      <div
        data-testid="survey-runner"
        lang={language}
        className={cn("flex flex-col bg-background text-foreground", fill === "viewport" ? "h-dvh" : "h-full")}
      >
        <header className="shrink-0 border-b bg-background px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
          <div className="mx-auto flex min-h-9 max-w-2xl items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
            {phase === "questions" && options.layout !== "single" && pages.length > 1 ? (
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                {t("stepNofM", { n: pageIndex + 1, m: pages.length })}
              </span>
            ) : null}
            {!noBack ? (
              <Button variant="ghost" size="icon" className="-mr-2 size-10 shrink-0" aria-label={t("close")} onClick={requestExit}>
                <XIcon className="size-5" />
              </Button>
            ) : null}
          </div>
          {options.showProgress && phase === "questions" && pages.length > 0 ? (
            <Progress value={progress} className="mx-auto mt-2 h-1.5 max-w-2xl" aria-label={t("stepNofM", { n: pageIndex + 1, m: pages.length })} />
          ) : null}
        </header>

        <main ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain">
          {phase === "intro" && survey.intro ? (
            <div className="mx-auto grid max-w-2xl gap-4 px-4 py-8 animate-in fade-in-0">
              {survey.intro.title ? <h2 className="text-2xl font-semibold tracking-tight">{text(survey.intro.title)}</h2> : null}
              {survey.intro.body ? <Markdown className="text-[0.95rem] leading-relaxed">{text(survey.intro.body)}</Markdown> : null}
            </div>
          ) : null}

          {phase === "completion" ? (
            <div className="mx-auto grid max-w-2xl justify-items-center gap-3 px-4 py-14 text-center animate-in fade-in-0 zoom-in-95">
              <CheckCircle2Icon className="size-14 text-success" strokeWidth={1.5} />
              <h2 className="text-2xl font-semibold tracking-tight">{text(survey.completion?.title) || t("thankYou")}</h2>
              <Markdown className="text-muted-foreground">{text(survey.completion?.body) || t("completionBody")}</Markdown>
            </div>
          ) : null}

          {phase === "questions" && page ? (
            <div
              key={page.key}
              className={cn(
                "mx-auto grid max-w-2xl gap-9 px-4 py-6 animate-in fade-in-0 duration-300",
                options.layout !== "single" && (direction === "forward" ? "slide-in-from-right-4" : "slide-in-from-left-4"),
              )}
            >
              {page.items.map((q, i) => (
                <QuestionView
                  key={q.id}
                  q={q}
                  number={numbers.get(q.id)}
                  error={errors.get(q.id)}
                  autoFocus={i === 0 && pageKey !== null}
                  solo={page.items.length === 1}
                />
              ))}
            </div>
          ) : null}

          {phase === "questions" && !page ? (
            <div className="mx-auto grid max-w-2xl gap-2 px-4 py-14 text-center">
              <h2 className="text-xl font-semibold">{t("emptyTitle")}</h2>
              <p className="text-muted-foreground">{t("emptyBody")}</p>
            </div>
          ) : null}
        </main>

        <footer className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="mx-auto flex max-w-2xl gap-2">
            {phase === "intro" ? (
              <Button size="lg" className="h-12 flex-1 text-base" onClick={() => setPhase("questions")}>
                {text(survey.intro?.buttonLabel) || t("start")}
              </Button>
            ) : null}
            {phase === "completion" ? (
              <Button size="lg" className="h-12 flex-1 text-base" onClick={() => completionResult && onSubmit(completionResult)}>
                {text(survey.completion?.buttonLabel) || t("done")}
              </Button>
            ) : null}
            {phase === "questions" && page ? (
              <>
                {options.allowBackNavigation && pageIndex > 0 ? (
                  <Button variant="outline" size="lg" className="h-12 flex-1 text-base" onClick={goBack}>
                    <ChevronLeftIcon />
                    {t("back")}
                  </Button>
                ) : null}
                <Button size="lg" className="h-12 flex-[2] text-base" onClick={goNext}>
                  {isLast ? t("submit") : t("next")}
                </Button>
              </>
            ) : null}
            {phase === "questions" && !page ? (
              <Button variant="outline" size="lg" className="h-12 flex-1" onClick={onCancel}>
                {t("close")}
              </Button>
            ) : null}
          </div>
          {showErrors && errors.size > 1 ? (
            <p role="status" className="mx-auto mt-2 max-w-2xl text-center text-sm text-destructive">
              {t("errPage")}
            </p>
          ) : null}
        </footer>
      </div>

      {/* Resume an unfinished response */}
      <AlertDialog open={phase === "resume"} onOpenChange={(open) => !open && !resumeChoice.current && doResume()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resumeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("resumeBody", { when: saved ? formatRelativeWhen(saved.savedAt, language) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={doStartOver}>{t("startOver")}</AlertDialogCancel>
            <AlertDialogAction onClick={doResume}>{t("resume")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave confirmation */}
      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("exitTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {options.resume.enabled && storage && storageKey ? t("exitBodySaved") : t("exitBodyLost")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("stay")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExitOpen(false)
                onCancel()
              }}
            >
              {t("leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Researcher-defined alerts */}
      <AlertDialog open={!!alert} onOpenChange={(open) => !open && ackAlert()}>
        {alert ? (
          <AlertDialogContent data-severity={alert.severity}>
            <AlertDialogHeader>
              <div className="flex items-center gap-2">
                <AlertIcon severity={alert.severity} />
                <AlertDialogTitle>{text(alert.title) || t("alertTitle")}</AlertDialogTitle>
              </div>
              <AlertDialogDescription asChild>
                <div>
                  <Markdown className="text-foreground">{text(alert.message)}</Markdown>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>{t("ok")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </RunnerContext.Provider>
  )
}
