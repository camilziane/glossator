import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { hashHeading, useArticleLanding } from "./use-landing"

function Article({ ids }: { ids: string[] }) {
  useArticleLanding("ml/x")
  return (
    <article>
      <h1 tabIndex={-1}>Title</h1>
      {ids.map((id) => (
        <section key={id} id={id}>
          <h2 tabIndex={-1} data-section-heading="">
            {id}
          </h2>
        </section>
      ))}
    </article>
  )
}

const el = (id: string) => document.getElementById(id)!

describe("useArticleLanding", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/")
    vi.restoreAllMocks()
  })

  it("lands on the section a deep link names", () => {
    window.history.replaceState(null, "", "/article/?b=ml&k=x#two")
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ top: 700 } as DOMRect)
    const scroll = vi.spyOn(window, "scrollTo")
    render(<Article ids={["one", "two"]} />)
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(rect.mock.contexts[0]).toBe(el("two"))
    expect(scroll).toHaveBeenCalledWith({ top: 700, behavior: "instant" })
    // the entry focus goes to its heading
    expect(hashHeading()).toBe(el("two").querySelector("h2"))
  })

  it("lands again when the hash changes in the same page (the address bar, a plain link)", () => {
    window.history.replaceState(null, "", "/article/?b=ml&k=x")
    render(<Article ids={["one", "two", "three"]} />)
    expect(hashHeading()).toBeNull()
    const rect = vi
      .spyOn(el("three"), "getBoundingClientRect")
      .mockReturnValue({ top: 900 } as DOMRect)
    const scroll = vi.spyOn(window, "scrollTo")
    act(() => {
      window.history.replaceState(null, "", "/article/?b=ml&k=x#three")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(rect).toHaveBeenCalled()
    expect(scroll).toHaveBeenCalledWith({ top: 900, behavior: "instant" })
    expect(document.activeElement).toBe(el("three").querySelector("h2"))
    // A hash naming no section leaves the page where it is.
    scroll.mockClear()
    act(() => {
      window.history.replaceState(null, "", "/article/?b=ml&k=x#nowhere")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(scroll).not.toHaveBeenCalled()
  })
})
