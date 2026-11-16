import { defineConfig, devices } from "@playwright/test"

/**
 * E2E UI tests - no real backend.
 *  - survey-*: the BUILT activity (dev/activity.b64) inside dev/host.html, which mimics the dashboard's
 *    EmbeddedActivity (atob -> srcdoc iframe, settings posted on load). Phone emulation.
 *  - builder: release/survey-builder.html opened from file:// with a mocked LAMP API.
 * Run `npm run test:e2e` (builds first).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npx vite --port 5179 --strictPort",
    url: "http://localhost:5179/dev/host.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "survey-android",
      testMatch: /survey\.spec\.ts/,
      use: { ...devices["Pixel 7"], baseURL: "http://localhost:5179" },
    },
    {
      name: "survey-iphone",
      testMatch: /survey\.spec\.ts/,
      use: { ...devices["iPhone 14"], browserName: "chromium", baseURL: "http://localhost:5179" },
    },
    {
      name: "builder",
      testMatch: /builder\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, acceptDownloads: true },
    },
    {
      name: "visual",
      testMatch: /\.visual\.ts/,
      use: { ...devices["Pixel 7"], baseURL: "http://localhost:5179" },
    },
  ],
})
