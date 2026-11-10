import { describe, expect, it } from "vitest"

import { createChordReader, goTarget, isTypingTarget } from "./keyboard"

describe("g chords", () => {
  it("read the second key", () => {
    expect(goTarget("t")).toBe("today")
    expect(goTarget("i")).toBe("inbox")
    expect(goTarget("s")).toBe("search")
    expect(goTarget("1")).toEqual({ bib: 1 })
    expect(goTarget("9")).toEqual({ bib: 9 })
    expect(goTarget("0")).toBeNull()
    expect(goTarget("x")).toBeNull()
  })

  it("complete within a second, and only then", () => {
    const reader = createChordReader(1000)
    expect(reader.read("g", 0)).toEqual({ kind: "started" })
    expect(reader.pending(500)).toBe(true)
    expect(reader.read("i", 800)).toEqual({ kind: "go", target: "inbox" })
    expect(reader.read("i", 900)).toEqual({ kind: "none" })

    expect(reader.read("g", 2000)).toEqual({ kind: "started" })
    expect(reader.read("i", 3200)).toEqual({ kind: "none" })
  })

  it("drop a chord whose second key means nothing, and swallow that key", () => {
    const reader = createChordReader()
    reader.read("g", 0)
    expect(reader.read("a", 10)).toEqual({ kind: "dropped" })
    expect(reader.read("a", 20)).toEqual({ kind: "none" })
  })

  it("wait through a modifier on the way to the second key", () => {
    const reader = createChordReader()
    reader.read("g", 0)
    expect(reader.read("Shift", 10)).toEqual({ kind: "none" })
    expect(reader.read("2", 20)).toEqual({ kind: "go", target: { bib: 2 } })
  })

  it("drop the chord on g g", () => {
    const reader = createChordReader()
    reader.read("g", 0)
    expect(reader.read("g", 10)).toEqual({ kind: "dropped" })
    reader.cancel()
    expect(reader.pending(20)).toBe(false)
  })
})

describe("typing", () => {
  it("is a field's, unless its dialog is on its way out", () => {
    document.body.innerHTML = `
      <input id="page-field" />
      <div role="dialog" data-state="open"><input id="open-field" /></div>
      <div role="dialog" data-state="closed"><input id="closing-field" /></div>
      <button id="button"></button>`
    const el = (id: string) => document.getElementById(id)
    expect(isTypingTarget(el("page-field"))).toBe(true)
    expect(isTypingTarget(el("open-field"))).toBe(true)
    expect(isTypingTarget(el("closing-field"))).toBe(false)
    expect(isTypingTarget(el("button"))).toBe(false)
    document.body.innerHTML = ""
  })
})
