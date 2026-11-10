import { afterEach, describe, expect, it, vi } from "vitest"

import { copyText } from "./clipboard"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("copyText", () => {
  it("uses the clipboard API when there is one", async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    await expect(copyText("glossator build")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("glossator build")
  })

  it("leaves the typesetting's word joiners on the page", async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    await copyText(`pp. 4–${String.fromCharCode(0x2060)}10`)
    expect(writeText).toHaveBeenCalledWith("pp. 4–10")
  })

  it("falls back to a text area, removed afterwards, the focus given back even on failure", async () => {
    vi.stubGlobal("navigator", {})
    const button = document.createElement("button")
    document.body.append(button)
    button.focus()
    document.execCommand = vi.fn(() => {
      throw new Error("refused")
    })
    await expect(copyText("glossator serve")).resolves.toBe(false)
    expect(document.querySelector("textarea")).toBeNull()
    expect(document.activeElement).toBe(button)

    document.execCommand = vi.fn(() => true)
    await expect(copyText("glossator serve")).resolves.toBe(true)
    expect(document.querySelector("textarea")).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})
