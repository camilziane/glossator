import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("keeps the theme's sizes beside a text colour", () => {
    expect(cn("text-small text-muted-foreground")).toBe("text-small text-muted-foreground")
    expect(cn("text-label text-rubric")).toBe("text-label text-rubric")
    expect(cn("text-title text-foreground")).toBe("text-title text-foreground")
    for (const size of ["note", "gloss", "table", "kbd"])
      expect(cn(`text-${size} text-muted-foreground`)).toBe(`text-${size} text-muted-foreground`)
  })

  it("lets a later size replace an earlier one", () => {
    expect(cn("text-ui", "text-small")).toBe("text-small")
    expect(cn("text-sm", "text-read")).toBe("text-read")
    expect(cn("text-small", "text-[0.9rem]")).toBe("text-[0.9rem]")
  })

  it("knows the theme's measure, shadow and animations", () => {
    expect(cn("max-w-measure", "max-w-none")).toBe("max-w-none")
    expect(cn("shadow-popover", "shadow-none")).toBe("shadow-none")
    expect(cn("animate-pop-in", "animate-none")).toBe("animate-none")
  })

  it("still resolves colours", () => {
    expect(cn("text-rubric", "text-ink")).toBe("text-ink")
  })
})
