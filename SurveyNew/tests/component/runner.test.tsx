import { describe, expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import { medication, survey } from "../helpers"
import { renderSurvey } from "./render"
import { surveyShapeHash } from "@/renderer/progress"

describe("SurveyRunner - medication branching", () => {
  it("No: hides the time question and submits null for it", async () => {
    const { user, result, onSubmit } = renderSurvey(medication)
    expect(screen.getByRole("heading", { name: "Did you already take your first dose of medication?" })).toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "No" }))
    // Only one visible question -> the button submits.
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(result()!.temporal_slices.map((s) => [s.item, s.value])).toEqual([
      ["Did you already take your first dose of medication?", "No"],
      ["At what time?", null],
    ])
    expect(result()!.static_data.skipped).toEqual(["dose_time"])
    expect(result()!.timestamp).toBeTruthy()
  })

  it("Yes: asks for the time, validates it, and records HH:mm", async () => {
    const { user, result } = renderSurvey(medication)
    await user.click(screen.getByRole("radio", { name: "Yes" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByRole("heading", { name: "At what time?" })).toBeInTheDocument()
    // Nothing pre-selected (the old survey auto-answered 01:00AM).
    expect(screen.getByText("Pick a time")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Please answer this question.")
    await user.click(within(screen.getByRole("radiogroup", { name: "Hours" })).getByRole("radio", { name: "8" }))
    await user.click(within(screen.getByRole("radiogroup", { name: "Minutes" })).getByRole("radio", { name: "30" }))
    await user.click(within(screen.getByRole("radiogroup", { name: "AM/PM" })).getByRole("radio", { name: "AM" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(result()!.temporal_slices.map((s) => s.value)).toEqual(["Yes", "08:30"])
    expect(result()!.static_data.answers).toEqual({ dose_taken: "Yes", dose_time: "08:30" })
  })

  it("Back keeps answers and the step counter follows visible questions", async () => {
    const { user } = renderSurvey(medication)
    expect(screen.queryByText(/^\d+ of \d+$/)).not.toBeInTheDocument() // single screen: no counter
    await user.click(screen.getByRole("radio", { name: "Yes" }))
    expect(screen.getByText("1 of 2")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("2 of 2")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true")
  })
})

describe("SurveyRunner - features", () => {
  it("auto-advances after a single tap when enabled", async () => {
    const { user } = renderSurvey(
      [
        { id: "a", type: "boolean", text: "First?" },
        { id: "b", type: "short", text: "Second?" },
      ],
      { options: { autoAdvance: true } },
    )
    await user.click(screen.getByRole("radio", { name: "Yes" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second?" })).toBeInTheDocument())
  })

  it("endSurveyIf turns Next into Submit and skips the rest", async () => {
    const { user, result } = renderSurvey([
      { id: "consent", type: "boolean", text: "Consent?", endSurveyIf: { question: "consent", op: "eq", value: "No" } },
      { id: "q2", type: "short", text: "Q2" },
    ])
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "No" }))
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(result()!.static_data.terminated_at).toBe("consent")
    expect(result()!.static_data.skipped).toEqual(["q2"])
  })

  it("shows an immediate alert once, and a submit alert before posting", async () => {
    const { user, onSubmit, result } = renderSurvey(
      [
        { id: "pain", type: "rating", text: "Pain?", min: 0, max: 3 },
        { id: "more", type: "short", text: "More?", required: false },
      ],
      {
        scores: [{ id: "total", method: "sum", questions: ["pain"] }],
        alerts: [
          { id: "now", when: { question: "pain", op: "gte", value: 3 }, title: "Ouch", message: "Immediate **help**", severity: "critical", timing: "immediate" },
          { id: "end", when: { score: "total", op: "gte", value: 2 }, message: "Thanks for telling us", severity: "warning", timing: "submit" },
        ],
      },
    )
    await user.click(screen.getByRole("radio", { name: "3" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("Ouch")
    expect(dialog).toHaveTextContent("Immediate help")
    await user.click(within(dialog).getByRole("button", { name: "OK" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await user.click(screen.getByRole("radio", { name: "2" }))
    await user.click(screen.getByRole("radio", { name: "3" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument() // shown once
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Submit" }))
    const end = await screen.findByRole("alertdialog")
    expect(end).toHaveTextContent("Thanks for telling us")
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(within(end).getByRole("button", { name: "OK" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(result()!.static_data.alerts).toEqual(["now", "end"])
    expect(result()!.static_data.scores).toEqual({ total: 3 })
  })

  it("intro and completion screens", async () => {
    const { user, onSubmit } = renderSurvey([{ id: "a", type: "boolean", text: "A?" }], {
      intro: { title: "Welcome", body: "Takes 1 minute" },
      completion: { title: "All set", body: "Bye" },
    })
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Start" }))
    await user.click(screen.getByRole("radio", { name: "Yes" }))
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByRole("heading", { name: "All set" })).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("single-page layout shows every question and scrolls to errors", async () => {
    const { user, onSubmit } = renderSurvey(
      [
        { id: "a", type: "short", text: "A?" },
        { id: "b", type: "short", text: "B?" },
      ],
      { options: { layout: "single", showQuestionNumbers: true } },
    )
    expect(screen.getByRole("heading", { name: /A\?/ })).toHaveTextContent("1.")
    expect(screen.getByRole("heading", { name: /B\?/ })).toHaveTextContent("2.")
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getAllByRole("alert")).toHaveLength(2)
    expect(screen.getByText("Please answer the highlighted questions.")).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("optional questions show a badge and can be cleared", async () => {
    const { user } = renderSurvey([{ id: "a", type: "boolean", text: "A?", required: false }])
    expect(screen.getByText("Optional")).toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "Yes" }))
    await user.click(screen.getByRole("button", { name: "Clear answer" }))
    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "false")
  })

  it("piping inserts earlier answers", async () => {
    const { user } = renderSurvey([
      { id: "name", type: "short", text: "Your pet's name?" },
      { id: "q", type: "boolean", text: "Is **{{name}}** well?" },
    ])
    await user.type(screen.getByRole("textbox"), "Rex")
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByRole("heading", { name: "Is Rex well?" })).toBeInTheDocument()
  })

  it("translated content and UI follow the language", async () => {
    renderSurvey(
      [{ id: "a", type: "boolean", text: { en: "Hello?", fr: "Bonjour ?" } }],
      { languages: ["en", "fr"] },
      { language: "fr-FR" },
    )
    expect(screen.getByRole("heading", { name: "Bonjour ?" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Oui" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeInTheDocument()
  })
})

describe("SurveyRunner - exit and resume", () => {
  it("close asks for confirmation when there are answers, then cancels", async () => {
    const { user, onCancel } = renderSurvey(medication)
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(onCancel).toHaveBeenCalledTimes(1) // no answers yet -> immediate
    await user.click(screen.getByRole("radio", { name: "Yes" }))
    await user.click(screen.getByRole("button", { name: "Close" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("Leave this survey?")
    await user.click(within(dialog).getByRole("button", { name: "Stay" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Leave" }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it("noBack hides the close button", () => {
    renderSurvey(medication, {}, { noBack: true })
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  })

  it("saves progress and offers to resume where the participant left off", async () => {
    const first = renderSurvey(medication)
    await first.user.click(screen.getByRole("radio", { name: "Yes" }))
    await first.user.click(screen.getByRole("button", { name: "Next" }))
    const saved = JSON.parse(localStorage.getItem("surveynew-progress-test")!)
    expect(saved.answers).toEqual({ dose_taken: "Yes" })
    expect(saved.pageKey).toBe("dose_time")
    first.unmount()

    const second = renderSurvey(medication)
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("Continue where you left off?")
    await second.user.click(within(dialog).getByRole("button", { name: "Continue" }))
    expect(await screen.findByRole("heading", { name: "At what time?" })).toBeInTheDocument()
    await second.user.click(screen.getByRole("button", { name: "Now" }))
    await second.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(second.result()!.static_data.resumed).toBe(true)
    expect(localStorage.getItem("surveynew-progress-test")).toBeNull()
  })

  it("Start over discards saved progress; expired or incompatible progress is ignored", async () => {
    const s = survey(medication)
    const save = (savedAt: number, hash = surveyShapeHash(s)) =>
      localStorage.setItem(
        "surveynew-progress-test",
        JSON.stringify({ v: 1, hash, savedAt, startTime: 1, seed: 1, answers: { dose_taken: "Yes" }, pageKey: "dose_time", durations: {} }),
      )
    save(1_000_000)
    const a = renderSurvey(medication)
    await a.user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Start over" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "false")
    expect(localStorage.getItem("surveynew-progress-test")).toBeNull()
    a.unmount()

    save(1_000_000 - 13 * 3_600_000) // older than the 12 h default
    renderSurvey(medication).unmount()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()

    save(1_000_000, "different")
    renderSurvey(medication)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("dismissing the resume dialog resumes instead of leaving a blank screen", async () => {
    const s = survey(medication)
    localStorage.setItem(
      "surveynew-progress-test",
      JSON.stringify({ v: 1, hash: surveyShapeHash(s), savedAt: 1_000_000, startTime: 1, seed: 1, answers: { dose_taken: "No" }, pageKey: null, durations: {} }),
    )
    const { user } = renderSurvey(medication)
    await screen.findByRole("alertdialog")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "true")
  })
})

describe("SurveyRunner - durations", () => {
  it("records active time per question", async () => {
    const { user, result } = renderSurvey(medication)
    await user.click(screen.getByRole("radio", { name: "No" }))
    await act(async () => {})
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(result()!.temporal_slices[0].duration).toBeGreaterThan(0)
    expect(result()!.duration).toBeGreaterThan(0)
  })
})

vi.setConfig({ testTimeout: 15000 })
