import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/activity/App"
import { _resetBridge, parseHostMessage } from "@/activity/bridge"
import { TEMPLATES } from "@/templates"
import { medication } from "../helpers"

function launch(data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data }))
  })
}

const payload = (settings: unknown, extra: Record<string, unknown> = {}) => ({
  activity: { id: "act1", name: "Med_Check", spec: "lamp.survey_new", settings },
  configuration: { language: "en-US" },
  autoCorrect: true,
  noBack: false,
  ...extra,
})

afterEach(() => {
  _resetBridge()
  document.documentElement.className = ""
  delete document.documentElement.dataset.theme
})

describe("bridge", () => {
  it("parses the dashboard launch message and ignores everything else", () => {
    expect(parseHostMessage(payload({ questions: [] }))).toMatchObject({ language: "en-US", noBack: false, activity: { id: "act1" } })
    expect(parseHostMessage({ settings: { questions: [] } })?.activity.settings).toEqual({ questions: [] }) // data.activity ?? data
    expect(parseHostMessage(null)).toBeNull()
    expect(parseHostMessage("{}")).toBeNull()
    expect(parseHostMessage({ type: "webpackOk" })).toBeNull()
    expect(parseHostMessage({ activity: {}, noBack: true })?.noBack).toBe(true)
  })
})

describe("activity App (host protocol)", () => {
  it("waits for the launch message, then renders the survey with the activity name", async () => {
    render(<App />)
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()
    launch({ type: "unrelated" })
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()
    launch(payload({ schemaVersion: 1, questions: medication }))
    expect(await screen.findByRole("heading", { name: "Med Check" })).toBeInTheDocument()
  })

  it("submits a JSON string to the parent with a truthy timestamp; close posts null", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App />)
    launch(payload({ schemaVersion: 1, questions: medication }))
    await user.click(await screen.findByRole("radio", { name: "No" }))
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(post).toHaveBeenCalledTimes(1)
    const [msg, origin] = post.mock.calls[0]
    expect(origin).toBe("*")
    expect(typeof msg).toBe("string")
    const parsed = JSON.parse(msg as string)
    expect(parsed.timestamp).toBeGreaterThan(0)
    expect(parsed.temporal_slices[0]).toMatchObject({ item: "Did you already take your first dose of medication?", value: "No" })
  })

  it("close button posts null", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App />)
    launch(payload({ schemaVersion: 1, questions: medication }))
    await user.click(await screen.findByRole("button", { name: "Close" }))
    expect(post).toHaveBeenCalledWith(null, "*")
  })

  it("applies the survey theme to <html>", async () => {
    render(<App />)
    launch(payload({ ...TEMPLATES.find((t) => t.id === "daily")!.survey, appearance: { theme: "rose", mode: "dark", radius: "lg" } }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("rose"))
    expect(document.documentElement).toHaveClass("dark")
    expect(document.documentElement.dataset.radius).toBe("lg")
  })

  it("shows a friendly error for missing settings and noBack hides Close", async () => {
    render(<App />)
    launch(payload({}, { noBack: true, configuration: { language: "es-ES" } }))
    expect(await screen.findByRole("heading", { name: "No se puede mostrar esta encuesta" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument()
  })

  it("runs legacy lamp.survey settings arrays too", async () => {
    render(<App />)
    launch(payload([{ text: "Old question", type: "boolean", required: true }]))
    expect(await screen.findByRole("heading", { name: "Old question" })).toBeInTheDocument()
  })
})
