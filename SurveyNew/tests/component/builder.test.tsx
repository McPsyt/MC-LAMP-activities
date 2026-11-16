import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BuilderApp } from "@/builder/BuilderApp"
import { DRAFT_KEY, emptySurvey, startAutosave, useBuilder } from "@/builder/store"
import { useSession } from "@/builder/server/session"
import { encodeDashboardFile } from "@/survey/dashboardFile"
import { hashJson } from "@/survey/hash"
import type { SurveyDefinition } from "@/survey/schema"
import { TEMPLATES } from "@/templates"
import { createFakeState, fakeFetch, type FakeState } from "../fakeLampServer"

const med = () => structuredClone(TEMPLATES.find((t) => t.id === "medication")!.survey) as SurveyDefinition

function setup(survey: SurveyDefinition = emptySurvey(), name = "") {
  useBuilder.getState().load(survey, { name })
  const user = userEvent.setup()
  const utils = render(<BuilderApp firstRun={false} />)
  return { user, ...utils }
}

async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: string | RegExp) {
  await user.click(trigger)
  await user.click(await screen.findByRole("option", { name: option }))
}

const editor = () => screen.getByTestId("question-editor")
const preview = () => screen.getByTestId("preview-frame")

beforeEach(() => {
  useSession.getState().disconnect()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("builder: authoring", () => {
  it("builds the medication branching survey from scratch and the preview follows the logic", async () => {
    const { user } = setup()
    await user.click(screen.getAllByRole("button", { name: /add your first question/i })[0])
    await user.click(await screen.findByRole("menuitem", { name: /Yes \/ No/ }))
    await user.type(within(editor()).getByLabelText("Question"), "Did you already take your first dose of medication?")

    await user.click(screen.getByRole("button", { name: "Add" }))
    await user.click(await screen.findByRole("menuitem", { name: /Time of day/ }))
    await user.type(within(editor()).getByLabelText("Question"), "At what time?")

    await user.click(within(editor()).getByRole("tab", { name: /Logic/ }))
    await user.click(within(editor()).getAllByRole("button", { name: "Add rule" })[0])
    await pick(user, within(editor()).getByRole("combobox", { name: "Question" }), /Did you already take/)
    expect(within(editor()).getByRole("combobox", { name: "Operator" })).toHaveTextContent("is")
    expect(within(editor()).getByRole("combobox", { name: "Value" })).toHaveTextContent("Yes")
    expect(within(editor()).getByText(/Shown when "Did you already take your first dose of .*" is "Yes"/)).toBeInTheDocument()

    const q2 = useBuilder.getState().survey.questions[1]
    expect(q2.showIf).toEqual({ question: "q1", op: "eq", value: "Yes" })

    // Preview: No -> submit directly; restart; Yes -> time question appears.
    await user.click(within(preview()).getByRole("radio", { name: "No" }))
    expect(within(preview()).getByRole("button", { name: "Submit" })).toBeInTheDocument()
    await user.click(within(preview()).getByRole("radio", { name: "Yes" }))
    await user.click(within(preview()).getByRole("button", { name: "Next" }))
    expect(within(preview()).getByRole("heading", { name: "At what time?" })).toBeInTheDocument()
  })

  it("edits options: add, auto value from label, reorder, remove", async () => {
    const { user } = setup()
    act(() => void useBuilder.getState().addQuestion("single"))
    const opts = () => within(editor()).getAllByTestId("option-row")
    expect(opts()).toHaveLength(2)
    await user.click(within(editor()).getByRole("button", { name: "Add option" }))
    expect(opts()).toHaveLength(3)
    const label = within(editor()).getByLabelText("Option 3 label")
    await user.clear(label)
    await user.type(label, "Very often")
    expect(within(editor()).getByLabelText("Option 3 value")).toHaveValue("very_often")
    await user.click(within(opts()[2]).getByRole("button", { name: "Move up" }))
    expect(within(editor()).getByLabelText("Option 2 label")).toHaveValue("Very often")
    await user.click(within(editor()).getByRole("button", { name: "Remove option 1" }))
    const q = useBuilder.getState().survey.questions[0]
    expect(q.type === "single" && q.options.map((o) => o.value)).toEqual(["very_often", "option_2"])
  })

  it("validation errors block export, and Check lists them", async () => {
    const { user } = setup()
    act(() => {
      useBuilder.getState().addQuestion("single")
      useBuilder.getState().updateQuestion("q1", { text: "Pick", options: [] } as never)
    })
    await user.click(screen.getByTestId("check-button"))
    const pop = await screen.findByRole("dialog")
    expect(within(pop).getByText(/has no options/)).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(screen.getAllByRole("button", { name: "Export" })[0])
    const dialog = await screen.findByRole("dialog", { name: "Export" })
    expect(within(dialog).getByText(/Fix 1 problem first/)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: /Download dashboard import file/ })).toBeDisabled()
  })

  it("undo and redo from the toolbar", async () => {
    const { user } = setup()
    act(() => void useBuilder.getState().addQuestion("short"))
    expect(useBuilder.getState().survey.questions).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: /^Undo/ }))
    expect(useBuilder.getState().survey.questions).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: /^Redo/ }))
    expect(useBuilder.getState().survey.questions).toHaveLength(1)
  })

  it("imports a classic survey from a dashboard export file", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: /File/ }))
    await user.click(await screen.findByRole("menuitem", { name: /Import/ }))
    const file = encodeDashboardFile([
      {
        name: "Old mood survey",
        spec: "lamp.survey",
        schedule: [],
        settings: [
          { text: "Mood today?", type: "likert" },
          { text: "Slept well?", type: "boolean", warnings: [{ answer: "No", warningText: "Please rest" }] },
        ],
      },
    ])
    const dialog = await screen.findByRole("dialog", { name: "Import" })
    await user.click(within(dialog).getByLabelText("Paste file contents"))
    await user.paste(file)
    const cand = await within(dialog).findByTestId("import-candidates")
    expect(cand).toHaveTextContent("classic survey")
    await user.click(within(cand).getByRole("button", { name: "Open" }))
    expect(await screen.findByTestId("outline-q1")).toHaveTextContent("Mood today?")
    expect(useBuilder.getState().survey.alerts?.[0].message).toBe("Please rest")
    expect(useBuilder.getState().meta.name).toBe("Old mood survey")
  })

  it("translations: switching the editing language edits that language only", async () => {
    const { user } = setup(med(), "Med")
    await user.click(screen.getByTestId("outline-dose_time"))
    await pick(user, screen.getByRole("combobox", { name: "Editing language" }), /Français/)
    const box = within(editor()).getByLabelText("Question")
    expect(box).toHaveValue("À quelle heure ?")
    await user.clear(box)
    await user.type(box, "Quelle heure ?")
    const q = useBuilder.getState().survey.questions.find((x) => x.id === "dose_time")!
    expect(q.text).toEqual({ en: "At what time?", fr: "Quelle heure ?" })
  })

  it("autosaves a draft without credentials", async () => {
    const stop = startAutosave()
    setup(med(), "Med")
    useSession.getState().connect({ serverUrl: "https://api.test", username: "researcher@study.org", password: "secret" }, false)
    useBuilder.getState().addQuestion("short")
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy())
    const all = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join("\n")
    expect(all).not.toContain("secret")
    expect(sessionStorage.length).toBe(0) // "remember for this tab" not ticked
    stop()
  })
})

describe("builder: server (mocked LAMP API)", () => {
  let state: FakeState
  beforeEach(() => {
    state = createFakeState()
    vi.stubGlobal("fetch", fakeFetch(state))
  })

  async function connect(user: ReturnType<typeof userEvent.setup>, email = "researcher@study.org", password = "secret") {
    await user.click(screen.getByRole("button", { name: /Server/ }))
    await user.click(await screen.findByRole("menuitem", { name: /Connect/ }))
    const d = await screen.findByRole("dialog", { name: "Connect to MindCheck" })
    await user.clear(within(d).getByLabelText("Server address"))
    await user.type(within(d).getByLabelText("Server address"), "https://api.test")
    await user.clear(within(d).getByLabelText("Email / username"))
    await user.type(within(d).getByLabelText("Email / username"), email)
    await user.type(within(d).getByLabelText("Password"), password)
    await user.click(within(d).getByRole("button", { name: "Connect" }))
    return d
  }

  it("shows a clear error for wrong credentials, and a researcher picker for admins", async () => {
    const { user } = setup()
    const d = await connect(user, "researcher@study.org", "wrong")
    expect(await within(d).findByRole("alert")).toHaveTextContent("not accepted")
    await user.keyboard("{Escape}")
    const d2 = await connect(user, "admin@study.org", "admin")
    await pick(user, await within(d2).findByRole("combobox", { name: "Researcher" }), "Dr. Research")
    await user.click(within(d2).getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(useSession.getState().researcherId).toBe("res1"))
  })

  it("creates on the server, then publishes an update in place with history and a version bump", async () => {
    const { user } = setup(med(), "Medication check-in")
    await connect(user)
    await user.click(screen.getByRole("button", { name: /Server/ }))
    await user.click(await screen.findByRole("menuitem", { name: /Create on server/ }))
    const cd = await screen.findByRole("dialog", { name: "Create in MindCheck" })
    await pick(user, await within(cd).findByRole("combobox", { name: "Study" }), "Pilot study")
    await user.click(within(cd).getByRole("button", { name: "Create activity" }))
    await waitFor(() => expect(useBuilder.getState().linked?.activityId).toBe("act100"))
    const created = state.activities.act100
    expect(created).toMatchObject({ name: "Medication check-in", spec: "lamp.survey_new", category: ["assess"], study: "study1" })
    expect(state.attachments["act100|lamp.dashboard.activity_details"]).toBeTruthy()

    // Researcher schedules it in the dashboard (simulated), then we edit and publish.
    created.schedule = [{ start_date: "2026-11-20", time: "09:00", repeat_interval: "daily" }]
    useBuilder.getState().updateQuestion("dose_time", { text: { en: "What time did you take it?", fr: "À quelle heure ?" } } as never)
    useBuilder.getState().removeQuestion("wellbeing")

    await user.click(screen.getByRole("button", { name: "Publish" }))
    const pd = await screen.findByRole("dialog", { name: /Publish/ })
    const summary = await within(pd).findByTestId("publish-summary")
    expect(summary).toHaveTextContent("Removed: wellbeing")
    expect(summary).toHaveTextContent(/may affect data analysis/)
    expect(within(pd).getByLabelText("New version")).toHaveValue("2")
    await user.type(within(pd).getByLabelText("What changed? (optional)"), "Clarified wording")
    state.log.length = 0
    await user.click(within(pd).getByRole("button", { name: "Publish version 2" }))
    await waitFor(() => expect(useBuilder.getState().linked?.version).toBe("2"))

    // Same activity id, schedule untouched, new settings live.
    expect(Object.keys(state.activities)).toEqual(["act100"])
    expect(created.schedule).toHaveLength(1)
    expect((created.settings as SurveyDefinition).version).toBe("2")
    expect((created.settings as SurveyDefinition).questions.map((q) => q.id)).not.toContain("wellbeing")
    // History written BEFORE the settings PUT.
    const historyPut = state.log.findIndex((l) => l.startsWith("PUT /type/act100/attachment/lamp.survey_new.history"))
    const settingsPut = state.log.findIndex((l) => l === "PUT /activity/act100")
    expect(historyPut).toBeGreaterThanOrEqual(0)
    expect(historyPut).toBeLessThan(settingsPut)
    const history = state.attachments["act100|lamp.survey_new.history"] as { revisions: Array<{ version: string; note?: string }> }
    expect(history.revisions.map((r) => r.version)).toEqual(["1", "2"])
    expect(history.revisions[1].note).toBe("Clarified wording")
  })

  it("detects a conflicting change on the server", async () => {
    const remote = med()
    state.activities.act7 = { id: "act7", name: "Med", spec: "lamp.survey_new", settings: remote, schedule: [], category: ["assess"], study: "study1" }
    const { user } = setup(med(), "Med")
    useBuilder.getState().setLinked({ serverUrl: "https://api.test", studyId: "study1", activityId: "act7", activityName: "Med", remoteHash: hashJson(remote), version: "1" })
    await connect(user)
    // Someone else publishes meanwhile.
    state.activities.act7.settings = { ...remote, version: "5" }
    useBuilder.getState().updateQuestion("dose_taken", { required: false })
    await user.click(screen.getByRole("button", { name: "Publish" }))
    const pd = await screen.findByRole("dialog", { name: /Publish/ })
    expect(await within(pd).findByText("Changed on the server")).toBeInTheDocument()
    expect(within(pd).getByRole("button", { name: /Publish version/ })).toBeDisabled()
    await user.click(within(pd).getByRole("button", { name: /Keep mine and review/ }))
    expect(await within(pd).findByTestId("publish-summary")).toBeInTheDocument()
    expect(within(pd).getByLabelText("New version")).toHaveValue("6")
  })

  it("stops publishing when version history can't be saved, unless the user downloads a backup", async () => {
    const remote = med()
    state.activities.act8 = { id: "act8", name: "Med", spec: "lamp.survey_new", settings: remote, schedule: [], category: null, study: "study1" }
    state.failAttachmentWrites = true
    const { user } = setup(med(), "Med")
    useBuilder.getState().setLinked({ serverUrl: "https://api.test", studyId: "study1", activityId: "act8", activityName: "Med", remoteHash: hashJson(remote), version: "1" })
    await connect(user)
    useBuilder.getState().updateQuestion("dose_taken", { required: false })
    await user.click(screen.getByRole("button", { name: "Publish" }))
    const pd = await screen.findByRole("dialog", { name: /Publish/ })
    await user.click(await within(pd).findByRole("button", { name: "Publish version 2" }))
    expect(await within(pd).findByText("Version history couldn't be saved")).toBeInTheDocument()
    expect((state.activities.act8.settings as SurveyDefinition).version).toBe("1")
    const createUrl = vi.fn(() => "blob:x")
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: () => {} }))
    await user.click(within(pd).getByRole("button", { name: /Download backup & publish anyway/ }))
    await waitFor(() => expect((state.activities.act8.settings as SurveyDefinition).version).toBe("2"))
    expect(createUrl).toHaveBeenCalled()
  })

  it("opens surveys from the server (SurveyNew only) and restores a revision from history", async () => {
    const v1 = med()
    const v2 = { ...med(), version: "2", questions: med().questions.slice(0, 2) }
    state.activities.act9 = { id: "act9", name: "Med EMA", spec: "lamp.survey_new", settings: v2, schedule: [], category: null, study: "study1" }
    state.activities.old = { id: "old", name: "Classic", spec: "lamp.survey", settings: [], schedule: [], category: null, study: "study1" }
    state.attachments["act9|lamp.survey_new.history"] = {
      revisions: [
        { version: "1", publishedAt: 1, settings: v1 },
        { version: "2", publishedAt: 2, settings: v2 },
      ],
    }
    const { user } = setup()
    await connect(user)
    await user.click(screen.getByRole("button", { name: /Server/ }))
    await user.click(await screen.findByRole("menuitem", { name: /Open from server/ }))
    const od = await screen.findByRole("dialog", { name: /Open a survey/ })
    await pick(user, await within(od).findByRole("combobox", { name: "Study" }), "Pilot study")
    const list = await within(od).findByTestId("server-surveys")
    await waitFor(() => expect(list).toHaveTextContent("Med EMA"))
    expect(list).not.toHaveTextContent("Classic")
    await user.click(within(list).getByRole("button", { name: "Open" }))
    await waitFor(() => expect(useBuilder.getState().linked?.activityId).toBe("act9"))
    expect(useBuilder.getState().survey.questions).toHaveLength(2)

    await user.click(screen.getByRole("button", { name: /Server/ }))
    await user.click(await screen.findByRole("menuitem", { name: /Version history/ }))
    const hd = await screen.findByRole("dialog", { name: "Version history" })
    const items = await within(hd).findAllByRole("listitem")
    expect(items[0]).toHaveTextContent("v2")
    expect(items[0]).toHaveTextContent("current")
    await user.click(within(items[1]).getByRole("button", { name: "Load into editor" }))
    await waitFor(() => expect(useBuilder.getState().survey.questions).toHaveLength(5))
    expect(useBuilder.getState().linked?.activityId).toBe("act9")
  })
})
