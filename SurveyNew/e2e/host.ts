import { expect, type FrameLocator, type Page } from "@playwright/test"
import { TEMPLATES } from "../src/templates"
import type { SurveyDefinition } from "../src/survey/schema"

export const template = (id: string) => structuredClone(TEMPLATES.find((t) => t.id === id)!.survey) as SurveyDefinition

/** Open the host simulator and launch a survey like the dashboard does. */
export async function launch(
  page: Page,
  settings: unknown,
  opts: { language?: string; noBack?: boolean; id?: string; name?: string } = {},
): Promise<FrameLocator> {
  if (!page.url().includes("/dev/host.html")) await page.goto("/dev/host.html?embedded=1")
  await page.evaluate(([s, o]) => window.__launch(s, o), [settings, opts] as const)
  const frame = page.frameLocator("iframe[title=activity]")
  await expect(frame.getByTestId("survey-runner")).toBeVisible()
  return frame
}

export async function results(page: Page): Promise<Array<Record<string, any>>> {
  return page.evaluate(() => window.__results as Array<Record<string, any>>)
}

export async function lastResult(page: Page) {
  await expect.poll(async () => (await results(page)).length).toBeGreaterThan(0)
  const r = await results(page)
  return r[r.length - 1]
}

declare global {
  interface Window {
    __results: unknown[]
    __launch: (settings: unknown, opts?: Record<string, unknown>) => Promise<void>
  }
}
