import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { createFakeState, handleFake, type FakeState } from "../tests/fakeLampServer"
import { template } from "./host"

const BUILDER = "file://" + path.resolve("release/survey-builder.html")
const API = "https://api.test"
const shots = path.resolve("docs/screenshots")

/** Block all network except the mocked MindCheck API (with CORS, like the real server's cors()). */
async function offlineWithFakeApi(page: Page, state: FakeState) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept", "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS" }
  await page.route(/^https?:\/\//, async (route) => {
    const req = route.request()
    if (!req.url().startsWith(API)) return route.abort()
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors })
    const r = handleFake(state, req.method(), req.url(), req.headers()["authorization"], req.postData() ? JSON.parse(req.postData()!) : undefined)
    return route.fulfill({ status: r.status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(r.body) })
  })
}

async function openBuilder(page: Page, state = createFakeState()) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await offlineWithFakeApi(page, state)
  await page.goto(BUILDER)
  return { state, errors }
}

async function pick(page: Page, combobox: ReturnType<Page["getByRole"]>, option: string | RegExp) {
  await combobox.click()
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click()
}

async function connect(page: Page) {
  await page.getByRole("button", { name: /Server/ }).click()
  await page.getByRole("menuitem", { name: /Connect/ }).click()
  const d = page.getByRole("dialog", { name: "Connect to MindCheck" })
  await d.getByLabel("Server address").fill(API)
  await d.getByLabel("Email / username").fill("researcher@study.org")
  await d.getByLabel("Password").fill("secret")
  await d.getByRole("button", { name: "Connect" }).click()
  await expect(d).toBeHidden()
}

test("builds the medication survey with branching, previews it and exports a dashboard file", async ({ page }) => {
  const { errors } = await openBuilder(page)
  await page.screenshot({ path: `${shots}/01-start.png`, animations: "disabled" })
  await page.getByRole("button", { name: /Blank survey/ }).click()

  await page.getByRole("button", { name: /Add your first question/ }).click()
  await page.getByRole("menuitem", { name: /Yes \/ No/ }).click()
  const editor = page.getByTestId("question-editor")
  await editor.getByLabel("Question", { exact: true }).fill("Did you already take your first dose of medication?")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: /Time of day/ }).click()
  await editor.getByLabel("Question", { exact: true }).fill("At what time?")
  await editor.getByRole("tab", { name: /Logic/ }).click()
  await editor.getByRole("button", { name: "Add rule" }).first().click()
  await pick(page, editor.getByRole("combobox", { name: "Question", exact: true }), /Did you already take/)
  await expect(editor.getByText(/Shown when/)).toContainText('is "Yes"')
  await page.screenshot({ path: `${shots}/02-logic.png`, animations: "disabled" })

  const phone = page.getByTestId("preview-frame")
  await phone.getByRole("radio", { name: "Yes" }).click()
  await phone.getByRole("button", { name: "Next" }).click()
  await expect(phone.getByRole("heading", { name: "At what time?" })).toBeVisible()
  await phone.getByRole("button", { name: "Now" }).click()
  await page.screenshot({ path: `${shots}/03-preview.png`, animations: "disabled" })
  await phone.getByRole("button", { name: "Submit" }).click()
  await expect(page.getByTestId("preview-data")).toContainText('"dose_time"'.replace("dose_time", "q2"))

  // Export the dashboard import file and decode it exactly like the dashboard's ImportActivity does.
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Export" })
  await dialog.getByLabel("Activity name").fill("Medication check-in")
  await page.screenshot({ path: `${shots}/04-export.png`, animations: "disabled" })
  const download = page.waitForEvent("download")
  await dialog.getByRole("button", { name: /Download dashboard import file/ }).click()
  const file = await (await download).path()
  const b64 = readFileSync(file, "utf8")
  const decoded = JSON.parse(decodeURIComponent(escape(atob(b64))))
  expect(decoded).toHaveLength(1)
  expect(decoded[0]).toMatchObject({ name: "Medication check-in", spec: "lamp.survey_new", schedule: [], category: ["assess"] })
  expect(decoded[0].settings.questions[1].showIf).toEqual({ question: "q1", op: "eq", value: "Yes" })
  expect(errors).toEqual([])
})

test("imports a classic dashboard export and restores the draft after reload", async ({ page }) => {
  await openBuilder(page)
  await page.getByRole("dialog").getByRole("button", { name: /Blank survey/ }).click()
  await page.getByRole("button", { name: /File/ }).click()
  await page.getByRole("menuitem", { name: /Import/ }).click()
  const legacy = JSON.parse(readFileSync("tests/fixtures/legacy-demo-surveys.json", "utf8"))[0]
  const settings = legacy.settings.map((q: any) => ({ ...q, options: Array.isArray(q.options) ? q.options.map((v: unknown) => ({ value: v })) : q.options }))
  const exportFile = Buffer.from(JSON.stringify([{ ...legacy, settings, schedule: [] }]), "utf8").toString("base64")
  await page.getByTestId("import-file").setInputFiles({ name: "export.json", mimeType: "application/json", buffer: Buffer.from(exportFile) })
  const cands = page.getByTestId("import-candidates")
  await expect(cands).toContainText("classic survey")
  await cands.getByRole("button", { name: "Open" }).click()
  await expect(page.getByTestId("outline-q1")).toBeVisible()
  const firstText = (await page.getByTestId("outline-q1").textContent())!.replace(/^\d+/, "").trim()
  await expect(page.getByTestId("preview-frame").getByRole("heading").first()).toBeVisible()

  await page.reload()
  await expect(page.getByTestId("outline-q1")).toContainText(firstText)
})

test("publish round trip on a (fake) MindCheck server keeps the same activity and records history", async ({ page }) => {
  const state = createFakeState()
  const v1 = template("medication")
  state.activities.act42 = {
    id: "act42",
    name: "Medication check-in",
    spec: "lamp.survey_new",
    settings: v1,
    schedule: [{ repeat_interval: "daily", time: "09:00" }],
    category: ["assess"],
    study: "study1",
  }
  await openBuilder(page, state)
  await page.getByRole("dialog").getByRole("button", { name: /Blank survey/ }).click()
  await connect(page)

  // Open from server
  await page.getByRole("button", { name: /Server/ }).click()
  await page.getByRole("menuitem", { name: /Open from server/ }).click()
  const od = page.getByRole("dialog", { name: /Open a survey/ })
  await pick(page, od.getByRole("combobox", { name: "Study" }), "Pilot study")
  await od.getByTestId("server-surveys").getByRole("button", { name: "Open" }).click()
  await expect(page.getByTestId("outline-dose_taken")).toBeVisible()

  // Add a branching follow-up after "wellbeing": only if feeling Bad or Very bad.
  await page.getByTestId("outline-wellbeing").click()
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: /Long text/ }).click()
  const editor = page.getByTestId("question-editor")
  await editor.getByLabel("Question", { exact: true }).fill("Sorry to hear that. What's going on?")
  await editor.getByRole("tab", { name: /Logic/ }).click()
  await editor.getByRole("button", { name: "Add rule" }).first().click()
  await pick(page, editor.getByRole("combobox", { name: "Question", exact: true }), /How are you feeling/)
  await pick(page, editor.getByRole("combobox", { name: "Operator", exact: true }), "is at most")
  await pick(page, editor.getByRole("combobox", { name: "Value", exact: true }), "Bad")

  // Publish
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  const pd = page.getByRole("dialog", { name: /Publish/ })
  await expect(pd.getByTestId("publish-summary")).toContainText("Added: q1")
  await pd.getByLabel("What changed? (optional)").fill("Follow-up for low mood")
  await page.screenshot({ path: `${shots}/05-publish.png`, animations: "disabled" })
  await pd.getByRole("button", { name: "Publish version 2" }).click()
  await expect(pd).toBeHidden()

  const live = state.activities.act42
  expect(Object.keys(state.activities)).toEqual(["act42"])
  expect(live.schedule).toEqual([{ repeat_interval: "daily", time: "09:00" }])
  expect((live.settings as any).version).toBe("2")
  expect((live.settings as any).questions.at(-1).showIf).toEqual({ question: "wellbeing", op: "lte", value: 2 })
  const hist = state.attachments["act42|lamp.survey_new.history"] as any
  expect(hist.revisions.map((r: any) => r.version)).toEqual(["1", "2"])

  // Reopen shows v2; history can restore v1, which publishes as v3.
  await page.reload()
  await expect(page.getByText("· v2")).toBeVisible()
  await connect(page)
  await page.getByRole("button", { name: /Server/ }).click()
  await page.getByRole("menuitem", { name: /Version history/ }).click()
  const hd = page.getByRole("dialog", { name: "Version history" })
  await page.screenshot({ path: `${shots}/06-history.png`, animations: "disabled" })
  await hd.getByRole("listitem").nth(1).getByRole("button", { name: "Load into editor" }).click()
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  await expect(pd.getByTestId("publish-summary")).toContainText("Removed: q1")
  await pd.getByRole("button", { name: "Publish version 3" }).click()
  await expect(pd).toBeHidden()
  expect((state.activities.act42.settings as any).questions).toHaveLength(5)
  expect((state.activities.act42.settings as any).version).toBe("3")
})

test("single file works offline and shows help", async ({ page }) => {
  const { errors } = await openBuilder(page)
  await page.getByTestId("template-phq9").click()
  await expect(page.getByTestId("outline-phq9")).toBeVisible()
  await page.getByRole("button", { name: "Help" }).click()
  await expect(page.getByRole("dialog", { name: "Quick start" })).toContainText("Survey Builder 1.0.0")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Survey settings" }).click()
  await page.screenshot({ path: `${shots}/07-settings.png`, animations: "disabled" })
  expect(errors).toEqual([])
})
