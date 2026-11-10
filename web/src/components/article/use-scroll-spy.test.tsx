import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { decodeHash, goToSection, useScrollSpy } from "./use-scroll-spy"

type Callback = (entries: Pick<IntersectionObserverEntry, "target" | "isIntersecting">[]) => void

/** An IntersectionObserver whose reports the test writes. */
class FakeObserver {
  static all: FakeObserver[] = []
  readonly targets: Element[] = []
  constructor(
    readonly report: Callback,
    readonly options?: IntersectionObserverInit
  ) {
    FakeObserver.all.push(this)
  }
  observe(el: Element) {
    this.targets.push(el)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

function Spy({ ids }: { ids: string[] }) {
  const [active] = useScrollSpy(ids, "end")
  return (
    <div>
      <p data-testid="active">{active ?? "none"}</p>
      {ids.map((id) => (
        <section key={id} id={id}>
          <h2 tabIndex={-1} data-section-heading="">
            {id}
          </h2>
        </section>
      ))}
      <div id="end" />
    </div>
  )
}

const el = (id: string) => document.getElementById(id)!
const active = () => screen.getByTestId("active").textContent

describe("useScrollSpy", () => {
  beforeEach(() => {
    FakeObserver.all = []
    vi.stubGlobal("IntersectionObserver", FakeObserver)
  })

  it("marks the first section crossing the reading band", () => {
    render(<Spy ids={["one", "two", "three"]} />)
    const [sections, end] = FakeObserver.all
    expect(sections!.targets.map((t) => t.id)).toEqual(["one", "two", "three"])
    expect(sections!.options?.rootMargin).toMatch(/^-\d+px 0px -55% 0px$/)
    expect(active()).toBe("none")

    act(() => sections!.report([{ target: el("two"), isIntersecting: true }]))
    expect(active()).toBe("two")
    act(() => sections!.report([{ target: el("one"), isIntersecting: true }]))
    expect(active()).toBe("one")
    act(() => sections!.report([{ target: el("one"), isIntersecting: false }]))
    expect(active()).toBe("two")

    // at the very end of the page, the last section (however short)
    act(() => end!.report([{ target: el("end"), isIntersecting: true }]))
    expect(active()).toBe("three")
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("goToSection", () => {
  /** Put the section `top` px below the window's top, the window `height` px high. */
  function place(el: HTMLElement, top: number, height = 800) {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top } as DOMRect)
    vi.stubGlobal("innerHeight", height)
  }

  it("puts the section in the URL, focuses its heading, and jumps at once when it is far", () => {
    window.history.replaceState(null, "", "/article/")
    render(<Spy ids={["alpha", "open-points"]} />)
    const heading = el("open-points").querySelector("h2")!
    const tint = vi.fn()
    heading.animate = tint
    place(el("open-points"), 5000)
    const push = vi.spyOn(window.history, "pushState")
    const scroll = vi.spyOn(window, "scrollTo")
    expect(goToSection("open-points")).toBe(true)
    expect(window.location.hash).toBe("#open-points")
    expect(document.activeElement).toBe(heading)
    // far: at once, then a moment of rubric on the heading
    expect(scroll).toHaveBeenCalledWith({ top: expect.any(Number), behavior: "instant" })
    expect(tint).toHaveBeenCalledTimes(1)
    // the URL first: Back returns where the reader was
    expect(push.mock.invocationCallOrder[0]!).toBeLessThan(scroll.mock.invocationCallOrder[0]!)
    expect(goToSection("nowhere")).toBe(false)
  })

  it("glides to a near section in at most 300 ms", () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
    render(<Spy ids={["alpha", "open-points"]} />)
    place(el("open-points"), 600)
    const scroll = vi.spyOn(window, "scrollTo")
    const start = performance.now()
    goToSection("open-points")
    expect(scroll).not.toHaveBeenCalled()
    // the frames run until 300 ms at most have passed
    frames.shift()!(start + 150)
    expect(scroll).toHaveBeenCalledTimes(1)
    frames.shift()!(start + 300)
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(frames).toHaveLength(0)
  })

  it("with less motion, jumps at once and holds the section while what is above settles", () => {
    const resized: (() => void)[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized.push(callback)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
    render(<Spy ids={["alpha", "open-points"]} />)
    place(el("open-points"), 300)
    const scroll = vi.spyOn(window, "scrollTo")
    goToSection("open-points")
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenLastCalledWith({ top: expect.any(Number), behavior: "instant" })
    // An image above loads: the page grows, the section is brought back.
    expect(resized).toHaveLength(1)
    act(() => resized[0]!())
    expect(scroll).toHaveBeenCalledTimes(2)
  })
})

describe("decodeHash", () => {
  it("reads the id a hash names", () => {
    expect(decodeHash("#open-points")).toBe("open-points")
    expect(decodeHash("#caf%C3%A9")).toBe("café")
    expect(decodeHash("#%E0%A4%A")).toBe("%E0%A4%A")
    expect(decodeHash("")).toBe("")
  })
})
