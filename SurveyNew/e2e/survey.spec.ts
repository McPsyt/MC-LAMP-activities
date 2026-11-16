import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { launch, lastResult, results, template } from "./host"

test.describe("medication branching (the example from the brief)", () => {
  test("No: the time question is skipped", async ({ page }) => {
    const f = await launch(page, template("medication"))
    await f.getByRole("radio", { name: "No" }).click()
    await f.getByRole("button", { name: "Next" }).click()
    await expect(f.getByRole("heading", { name: /main reason/ })).toBeVisible()
    await f.getByRole("radio", { name: "I forgot" }).click()
    await f.getByRole("button", { name: "Next" }).click()
    await f.getByRole("radio", { name: "Good", exact: true }).click()
    await f.getByRole("button", { name: "Submit" }).click()
    const r = await lastResult(page)
    expect(r.timestamp).toBeGreaterThan(0)
    expect(r.static_data.skipped).toEqual(["dose_time", "side_effects"])
    expect(r.static_data.answers).toEqual({ dose_taken: "No", missed_reason: "forgot", wellbeing: 4 })
    expect(r.temporal_slices.find((s: any) => s.item === "At what time?").value).toBeNull()
  })

  test("Yes: asks the time, pipes it into the next question", async ({ page }) => {
    const f = await launch(page, template("medication"))
    await f.getByRole("radio", { name: "Yes" }).click()
    await f.getByRole("button", { name: "Next" }).click()
    await expect(f.getByRole("heading", { name: "At what time?" })).toBeVisible()
    await f.getByRole("radiogroup", { name: "Hours" }).getByRole("radio", { name: "8", exact: true }).click()
    await f.getByRole("radiogroup", { name: "Minutes" }).getByRole("radio", { name: "15" }).click()
    await f.getByRole("radiogroup", { name: "AM/PM" }).getByRole("radio", { name: "AM" }).click()
    await f.getByRole("button", { name: "Next" }).click()
    await expect(f.getByRole("heading", { name: /Since your dose at 8:15 AM/ })).toBeVisible()
    await f.getByRole("checkbox", { name: "Headache" }).click()
    await f.getByRole("checkbox", { name: "None of these" }).click()
    await expect(f.getByRole("checkbox", { name: "Headache" })).toHaveAttribute("aria-checked", "false")
    await f.getByRole("button", { name: "Next" }).click()
    await f.getByRole("radio", { name: "Very good" }).click()
    await f.getByRole("button", { name: "Submit" }).click()
    const r = await lastResult(page)
    expect(r.static_data.answers).toMatchObject({ dose_taken: "Yes", dose_time: "08:15", side_effects: ["none"], wellbeing: 5 })
  })

  test("French content, close button posts null, noBack hides it", async ({ page }) => {
    const f = await launch(page, template("medication"), { language: "fr-FR" })
    await expect(f.getByRole("heading", { name: /première dose/ })).toBeVisible()
    await expect(f.getByRole("button", { name: "Suivant" })).toBeVisible()
    await f.getByRole("button", { name: "Fermer" }).click()
    await expect.poll(async () => (await results(page)).at(-1)).toEqual({ closed: true })
    const g = await launch(page, template("medication"), { noBack: true })
    await expect(g.getByRole("radio", { name: "Yes" })).toBeVisible()
    await expect(g.getByRole("button", { name: "Close" })).toHaveCount(0)
  })
})

test("every question type can be answered and submitted", async ({ page }) => {
  const f = await launch(page, template("all"))
  await f.getByRole("button", { name: "Start" }).click()

  // Choices
  await f.getByRole("radio", { name: "Option B" }).click()
  await f.getByRole("checkbox", { name: "X" }).click()
  await f.getByRole("checkbox", { name: "Z" }).click()
  await f.getByRole("combobox").click()
  await f.getByPlaceholder("Search").fill("queb")
  await f.getByRole("option", { name: "Quebec" }).click()
  await f.getByRole("radio", { name: "Yes" }).click()
  // Drag "Diet" to the top of the ranking.
  await f.getByRole("button", { name: "Sleep: 1" }).scrollIntoViewIfNeeded()
  const handle = f.getByRole("button", { name: "Diet: 3" })
  const target = f.getByRole("button", { name: "Sleep: 1" })
  const hb = (await handle.boundingBox())!
  const tb = (await target.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 10, { steps: 5 })
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 2, { steps: 10 })
  await page.mouse.up()
  await expect(f.getByRole("button", { name: "Diet: 1" })).toBeVisible()
  await f.getByRole("button", { name: "Next" }).click()

  // Scales
  await f.getByRole("radio", { name: "Agree", exact: true }).click()
  for (const row of ["Feel rested", "Feel worried", "Laugh"]) await f.getByRole("radiogroup", { name: row }).getByRole("radio", { name: "Often" }).click()
  await f.locator("[data-slot=survey-slider]").first().scrollIntoViewIfNeeded()
  const sb = (await f.locator("[data-slot=survey-slider]").first().boundingBox())!
  await page.mouse.click(sb.x + sb.width * 0.7, sb.y + sb.height / 2)
  await f.locator("[data-slot=survey-slider]").nth(1).scrollIntoViewIfNeeded()
  const vb = (await f.locator("[data-slot=survey-slider]").nth(1).boundingBox())!
  await page.mouse.click(vb.x + vb.width * 0.25, vb.y + vb.height / 2)
  await f.getByRole("radio", { name: "6", exact: true }).click()
  await f.getByRole("radio", { name: "Okay" }).click()
  await expect(f.getByRole("alert")).toHaveCount(0)
  await f.getByRole("button", { name: "Next" }).click()

  // Entry
  await f.getByRole("textbox", { name: /cups of coffee/ }).fill("2")
  await f.getByRole("button", { name: /Date \(not in the future\)/ }).click()
  await f.getByRole("button", { name: "Today", exact: true }).click()
  await f.getByRole("radiogroup", { name: "Hours" }).first().getByRole("radio", { name: "14" }).click()
  await f.getByRole("button", { name: "Date and time" }).click()
  await f.getByRole("button", { name: "Today", exact: true }).click()
  await f.getByRole("button", { name: "Now" }).nth(1).click()
  await f.getByRole("button", { name: "Hours +" }).click()
  await f.getByRole("button", { name: "Submit" }).click()
  await f.getByRole("button", { name: "Done" }).click()

  const r = await lastResult(page)
  const a = r.static_data.answers
  expect(a).toMatchObject({ single: "b", multiple: ["x", "z"], dropdown: "Quebec", yesno: "Yes", likert: 4, "matrix.r1": 3, rating: 6, faces: 3, number: 2, time: "14:00", duration: 60 })
  expect(a.ranking[0]).toBe("diet")
  expect(a.slider).toBeGreaterThanOrEqual(6)
  expect(a.slider).toBeLessThanOrEqual(8)
  expect(a.vas).toBeGreaterThan(10)
  expect(a.vas).toBeLessThan(40)
  expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(a.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/)
  expect(r.temporal_slices.length).toBe(21) // 19 answerable items, matrix expanded to 3 rows, plus the "Other" slice
})

test("resume after the app is killed mid-survey", async ({ page }) => {
  const f = await launch(page, template("medication"), { id: "resume-1" })
  await f.getByRole("radio", { name: "Yes" }).click()
  await f.getByRole("button", { name: "Next" }).click()
  await page.reload()
  const g = await launch(page, template("medication"), { id: "resume-1" })
  await expect(g.getByRole("alertdialog")).toContainText("Continue where you left off?")
  await g.getByRole("button", { name: "Continue" }).click()
  await expect(g.getByRole("heading", { name: "At what time?" })).toBeVisible()
  await expect(g.getByText("2 of 4")).toBeVisible()
})

test("PHQ-9: auto-advance, total score and the item-9 safety alert", async ({ page }) => {
  const f = await launch(page, template("phq9"))
  await f.getByRole("button", { name: "Next" }).click() // intro info item
  for (let i = 0; i < 9; i++) {
    await f.getByRole("radio", { name: "Nearly every day" }).click() // auto-advances
    if (i < 8) await expect(f.getByText(`${i + 3} of 11`)).toBeVisible()
  }
  await expect(f.getByRole("heading", { name: /How difficult/ })).toBeVisible()
  await f.getByRole("button", { name: "Submit" }).click()
  const alert = f.getByRole("alertdialog")
  await expect(alert).toContainText("You're not alone")
  await expect(alert).toContainText("988")
  await alert.getByRole("button", { name: "OK" }).click()
  await expect(f.getByRole("alertdialog")).toContainText("Thank you for sharing")
  await f.getByRole("button", { name: "OK" }).click()
  await f.getByRole("button", { name: "Done" }).click()
  const r = await lastResult(page)
  expect(r.static_data.scores).toEqual({ phq9_total: 27 })
  expect(r.static_data.alerts).toEqual(["phq9_item9", "phq9_severe"])
})

test("randomized options: order differs between participants and is recorded", async ({ page }) => {
  const orders = new Set<string>()
  for (let i = 0; i < 4; i++) {
    const f = await launch(page, template("daily"), { id: `rand-${i}` })
    for (let k = 0; k < 5; k++) {
      // jump to the activity question via answers
      if (k === 0) await f.getByRole("radio", { name: "Good", exact: true }).click()
      if (k === 1) {
        // Tap exactly mid-line: must still count as an answer.
        const b = (await f.locator("[data-slot=survey-slider]").boundingBox())!
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
        await f.getByRole("button", { name: "Next" }).click()
      }
      if (k === 2) {
        await f.getByRole("button", { name: "Now" }).click()
        await f.getByRole("button", { name: "Next" }).click()
      }
      if (k === 3) {
        await f.getByRole("button", { name: "Hours +" }).click()
        await f.getByRole("button", { name: "Next" }).click()
      }
      if (k === 4) await f.getByRole("radio", { name: "7", exact: true }).click()
    }
    await expect(f.getByRole("heading", { name: /What have you done today/ })).toBeVisible()
    const labels = await f.getByRole("checkbox").allTextContents()
    expect(labels.at(-1)).toBe("None of these")
    orders.add(labels.join("|"))
    await f.getByRole("checkbox").first().click()
    await f.getByRole("button", { name: "Next" }).click()
    await f.getByRole("button", { name: "Submit" }).click()
    const r = await lastResult(page)
    expect(r.static_data.option_order.activity).toHaveLength(5)
  }
  expect(orders.size).toBeGreaterThan(1)
})

test("non-Latin UI languages render correctly from the atob-decoded bundle", async ({ page }) => {
  for (const [lang, next, title] of [
    ["zh-CN", "下一步", "选填"],
    ["ko-KR", "다음", "선택 사항"],
    ["hi-IN", "आगे", "वैकल्पिक"],
    ["zh-HK", "下一步", "選填"],
  ]) {
    const f = await launch(page, { schemaVersion: 1, questions: [{ id: "a", type: "boolean", text: "Q", required: false }, { id: "b", type: "short", text: "R" }] }, { language: lang })
    await expect(f.getByRole("button", { name: next })).toBeVisible()
    await expect(f.getByText(title)).toBeVisible()
  }
})

test("themes and dark mode", async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: "dark" })
  const f = await launch(page, template("daily"))
  const html = f.locator("html")
  await expect(html).toHaveAttribute("data-theme", "blue")
  await expect(html).toHaveClass(/dark/)
  await page.screenshot({ path: info.outputPath("daily-dark.png") })
  const s = template("medication")
  s.appearance = { theme: "rose", mode: "light", radius: "xl" }
  const g = await launch(page, s)
  await expect(g.locator("html")).toHaveAttribute("data-theme", "rose")
  await expect(g.locator("html")).not.toHaveClass(/dark/)
})

test("fits a 360px-wide phone without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  for (const id of ["all", "gad7", "phq9"]) {
    const f = await launch(page, template(id))
    if (id === "all") await f.getByRole("button", { name: "Start" }).click()
    const overflow = await f.locator("body").evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, id).toBeLessThanOrEqual(0)
  }
})

test("accessibility: no serious axe violations on question screens", async ({ page }) => {
  const s = template("all")
  delete s.intro
  s.options = { ...s.options, layout: "single" }
  await launch(page, s)
  const res = await new AxeBuilder({ page }).include("iframe").disableRules(["region", "landmark-one-main", "page-has-heading-one"]).analyze()
  const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} - ${v.help}`)).toEqual([])
})
