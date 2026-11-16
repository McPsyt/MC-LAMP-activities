/**
 * Optional visual baselines (machine/font sensitive): `npm run test:visual` (add --update-snapshots to refresh).
 * Also writes docs/screenshots/phone-*.png used in the collaborator guide.
 */
import { expect, test } from "@playwright/test"
import path from "node:path"
import { launch, template } from "./host"

const shots = path.resolve("docs/screenshots")

for (const [name, theme, mode] of [
  ["zinc-light", "zinc", "light"],
  ["blue-dark", "blue", "dark"],
  ["rose-light", "rose", "light"],
] as const) {
  test(`medication first screen - ${name}`, async ({ page }) => {
    const s = template("medication")
    s.appearance = { theme, mode, radius: "md" }
    const f = await launch(page, s, { id: `visual-${name}` })
    await f.getByRole("radio", { name: "Yes" }).click()
    await page.screenshot({ path: `${shots}/phone-${name}.png`, animations: "disabled" })
    await expect(page).toHaveScreenshot(`medication-${name}.png`, { maxDiffPixelRatio: 0.02 })
  })
}

test("question types gallery", async ({ page }) => {
  const s = template("all")
  delete s.intro
  const f = await launch(page, s)
  await page.screenshot({ path: `${shots}/phone-choices.png`, animations: "disabled" })
  await f.getByRole("button", { name: "Next" }).click()
  await page.screenshot({ path: `${shots}/phone-scales.png`, animations: "disabled" })
  await expect(page).toHaveScreenshot("scales.png", { maxDiffPixelRatio: 0.02 })
})

test("PHQ-9 alert", async ({ page }) => {
  const s = template("phq9")
  s.questions = s.questions.filter((q) => q.id === "phq9")
  s.scores = []
  s.alerts = s.alerts!.filter((a) => a.id === "phq9_item9")
  const f = await launch(page, s)
  await f.getByRole("radio", { name: "Several days" }).click()
  await f.getByRole("button", { name: "Submit" }).click()
  await expect(f.getByRole("alertdialog")).toBeVisible()
  await page.screenshot({ path: `${shots}/phone-alert.png`, animations: "disabled" })
})
