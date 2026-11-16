import { describe, expect, it } from "vitest"
import { fireEvent, screen, within } from "@testing-library/react"
import type { Question } from "@/survey/schema"
import { renderSurvey } from "./render"

/** Render one question, interact, submit, return the stored answers. */
async function answer(q: Question, act: (u: ReturnType<typeof renderSurvey>["user"]) => Promise<void>) {
  const r = renderSurvey([q])
  await act(r.user)
  await r.user.click(screen.getByRole("button", { name: "Submit" }))
  const out = { answers: r.result()?.static_data.answers, slices: r.result()?.temporal_slices }
  r.unmount()
  return out
}

describe("choice inputs", () => {
  it("single choice with Other text", async () => {
    const { answers } = await answer(
      { id: "s", type: "single", text: "S", options: [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }], allowOther: true },
      async (u) => {
        await u.click(screen.getByRole("radio", { name: "Other" }))
        await u.type(screen.getByRole("textbox", { name: "Please specify" }), "Kiwi")
      },
    )
    expect(answers).toEqual({ s: "other", "s.other": "Kiwi" })
  })

  it("multiple choice: exclusive option clears others; values keep authored order", async () => {
    const { answers } = await answer(
      {
        id: "m",
        type: "multiple",
        text: "M",
        options: [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "none", label: "None", exclusive: true }],
      },
      async (u) => {
        await u.click(screen.getByRole("checkbox", { name: "B" }))
        await u.click(screen.getByRole("checkbox", { name: "A" }))
        await u.click(screen.getByRole("checkbox", { name: "None" }))
        expect(screen.getByRole("checkbox", { name: "A" })).toHaveAttribute("aria-checked", "false")
        await u.click(screen.getByRole("checkbox", { name: "B" }))
        await u.click(screen.getByRole("checkbox", { name: "A" }))
        expect(screen.getByRole("checkbox", { name: "None" })).toHaveAttribute("aria-checked", "false")
      },
    )
    expect(answers).toEqual({ m: ["a", "b"] })
  })

  it("multiple choice: max selected is enforced at validation", async () => {
    const r = renderSurvey([{ id: "m", type: "multiple", text: "M", maxSelected: 1, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }])
    expect(screen.getByText("Select up to 1")).toBeInTheDocument()
    await r.user.click(screen.getByRole("checkbox", { name: "A" }))
    await r.user.click(screen.getByRole("checkbox", { name: "B" }))
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Select no more than 1.")
    expect(r.onSubmit).not.toHaveBeenCalled()
  })

  it("boolean, likert preset values", async () => {
    const { answers } = await answer({ id: "l", type: "likert", text: "L", preset: "frequency4" }, async (u) => {
      await u.click(screen.getByRole("radio", { name: "More than half the days" }))
    })
    expect(answers).toEqual({ l: 2 })
  })

  it("dropdown with search", async () => {
    const { answers } = await answer(
      { id: "d", type: "dropdown", text: "Province", options: ["Alberta", "Ontario", "Quebec"].map((v) => ({ value: v })) },
      async (u) => {
        await u.click(screen.getByRole("combobox"))
        await u.type(screen.getByPlaceholderText("Search"), "que")
        expect(screen.queryByRole("option", { name: "Ontario" })).not.toBeInTheDocument()
        await u.click(screen.getByRole("option", { name: "Quebec" }))
        expect(screen.getByRole("combobox")).toHaveTextContent("Quebec")
      },
    )
    expect(answers).toEqual({ d: "Quebec" })
  })

  it("matrix: one answer per row, every row required", async () => {
    const r = renderSurvey([
      { id: "g", type: "matrix", text: "Grid", preset: "frequency4", rows: [{ id: "r1", text: "Row one" }, { id: "r2", text: "Row two" }] },
    ])
    await r.user.click(within(screen.getByRole("radiogroup", { name: "Row one" })).getByRole("radio", { name: "Nearly every day" }))
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Please answer every row.")
    await r.user.click(within(screen.getByRole("radiogroup", { name: "Row two" })).getByRole("radio", { name: "Not at all" }))
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.static_data.answers).toEqual({ "g.r1": 3, "g.r2": 0 })
    expect(r.result()!.temporal_slices.map((s) => s.item)).toEqual(["Row one", "Row two"])
  })

  it("ranking: confirm order or move items", async () => {
    const { answers } = await answer(
      { id: "rk", type: "ranking", text: "Rank", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }] },
      async (u) => {
        await u.click(screen.getByRole("button", { name: "Move up: Z" }))
        expect(screen.queryByRole("button", { name: "Keep this order" })).not.toBeInTheDocument()
      },
    )
    expect(answers).toEqual({ rk: ["x", "z", "y"] })
    const r2 = await answer({ id: "rk", type: "ranking", text: "Rank", options: [{ value: "x" }, { value: "y" }] }, async (u) => {
      await u.click(screen.getByRole("button", { name: "Keep this order" }))
    })
    expect(r2.answers).toEqual({ rk: ["x", "y"] })
  })
})

describe("scale inputs", () => {
  it("rating (NRS) and faces", async () => {
    const { answers } = await answer({ id: "n", type: "rating", text: "N", min: 0, max: 10, minLabel: "None", maxLabel: "Worst" }, async (u) => {
      expect(screen.getByText("None")).toBeInTheDocument()
      await u.click(screen.getByRole("radio", { name: "7" }))
    })
    expect(answers).toEqual({ n: 7 })
    const f = await answer({ id: "f", type: "faces", text: "F", count: 5 }, async (u) => {
      await u.click(screen.getByRole("radio", { name: "Very good" }))
    })
    expect(f.answers).toEqual({ f: 5 })
  })

  it("slider is unanswered until touched, then keyboard adjusts it", async () => {
    const r = renderSurvey([{ id: "sl", type: "slider", text: "S", min: 0, max: 10, step: 1, unit: "pts" }])
    expect(screen.getByText("Tap or drag to choose")).toBeInTheDocument()
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Please answer this question.")
    const thumb = screen.getByRole("slider")
    thumb.focus()
    await r.user.keyboard("{ArrowRight}")
    expect(screen.getByText("6 pts")).toBeInTheDocument()
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.static_data.answers).toEqual({ sl: 6 })
  })

  it("VAS hides the number", async () => {
    const r = renderSurvey([{ id: "v", type: "vas", text: "V", minLabel: "No pain", maxLabel: "Worst pain" }])
    screen.getByRole("slider").focus()
    await r.user.keyboard("{End}")
    expect(screen.queryByText("100")).not.toBeInTheDocument()
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.static_data.answers).toEqual({ v: 100 })
  })
})

describe("entry inputs", () => {
  it("number parses commas and rejects junk", async () => {
    const r = renderSurvey([{ id: "n", type: "number", text: "N", decimals: 1, unit: "kg" }])
    const box = screen.getByRole("textbox")
    await r.user.type(box, "abc")
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid number.")
    await r.user.clear(box)
    await r.user.type(box, "72,5")
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.static_data.answers).toEqual({ n: 72.5 })
  })

  it("short text submits on Enter; long text shows a counter near the limit", async () => {
    const r = renderSurvey([
      { id: "a", type: "short", text: "A" },
      { id: "b", type: "text", text: "B", maxLength: 30 },
    ])
    await r.user.type(screen.getByRole("textbox"), "hello{Enter}")
    expect(screen.getByRole("heading", { name: "B" })).toBeInTheDocument()
    await r.user.type(screen.getByRole("textbox"), "x".repeat(25))
    expect(screen.getByText("5 characters left")).toBeInTheDocument()
  })

  it("date picker respects max date", async () => {
    const r = renderSurvey([{ id: "d", type: "date", text: "D", maxDate: "today" }], {}, { clock: () => new Date(2026, 10, 16, 12).getTime() })
    await r.user.click(screen.getByRole("button", { name: "D Pick a date" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("button", { name: /November 17/ })).toBeDisabled()
    await r.user.click(within(dialog).getByRole("button", { name: /November 14/ }))
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.static_data.answers).toEqual({ d: "2026-11-14" })
  })

  it("24-hour time and the Now shortcut", async () => {
    const at = new Date(2026, 10, 16, 21, 7).getTime()
    const r = renderSurvey([{ id: "t", type: "time", text: "T", format: "24h", minuteStep: 15 }], {}, { clock: () => at })
    expect(within(screen.getByRole("radiogroup", { name: "Hours" })).getAllByRole("radio")).toHaveLength(24)
    expect(within(screen.getByRole("radiogroup", { name: "Minutes" })).getAllByRole("radio")).toHaveLength(4)
    await r.user.click(screen.getByRole("button", { name: "Now" }))
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.static_data.answers).toEqual({ t: "21:00" })
  })

  it("datetime combines date and time with a UTC offset", async () => {
    const r = renderSurvey([{ id: "dt", type: "datetime", text: "DT" }], {}, { clock: () => new Date(2026, 10, 16, 9, 30).getTime() })
    await r.user.click(screen.getByRole("button", { name: "DT Pick a date" }))
    await r.user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Today" }))
    await r.user.click(screen.getByRole("button", { name: "Now" }))
    await r.user.click(screen.getByRole("button", { name: "Submit" }))
    expect(String(r.result()!.static_data.answers.dt)).toMatch(/^2026-11-16T09:30:00[+-]\d{2}:\d{2}$/)
  })

  it("duration stepper stores minutes", async () => {
    const { answers } = await answer({ id: "du", type: "duration", text: "Sleep", minuteStep: 15 }, async (u) => {
      await u.click(screen.getByRole("button", { name: "Hours +" }))
      await u.click(screen.getByRole("button", { name: "Hours +" }))
      await u.click(screen.getByRole("button", { name: "Minutes +" }))
    })
    expect(answers).toEqual({ du: 135 })
  })

  it("info and section items render without inputs and produce no slices", async () => {
    const r = renderSurvey(
      [
        { id: "s", type: "section", text: "Part 1", description: "Intro text" },
        { id: "i", type: "info", text: "Read **this**" },
        { id: "q", type: "boolean", text: "Q" },
      ],
      { options: { layout: "section" } },
    )
    expect(screen.getByRole("heading", { name: "Part 1" })).toBeInTheDocument()
    expect(screen.getByText("this").tagName).toBe("STRONG")
    await r.user.click(screen.getByRole("radio", { name: "Yes" }))
    fireEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(r.result()!.temporal_slices).toHaveLength(1)
  })
})
