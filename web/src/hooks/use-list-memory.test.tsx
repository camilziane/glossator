import { act, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { router, setNavigation } from "../../tests/utils/navigation"

import { noteEntryHref, resetPageEntries, startEntry } from "./page-entry"
import {
  readListMemory,
  readListOrder,
  rememberListOrder,
  useFromHere,
  useListMemory,
  useReturnToList,
  writeListMemory,
} from "./use-list-memory"

function at(path: string) {
  window.history.replaceState(null, "", path)
  const url = new URL(path, "http://localhost")
  setNavigation({ pathname: url.pathname, search: url.search.slice(1) })
}

function List() {
  const memory = useListMemory()
  return (
    <>
      <p>restored: {memory.restored?.row ?? "nothing"}</p>
      <button type="button" onClick={() => memory.remember("row-7")}>
        Move
      </button>
    </>
  )
}

describe("list memory", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    resetPageEntries()
  })
  afterEach(() => resetPageEntries())

  it("remembers the current row per list, without the inbox's current paper", () => {
    at("/inbox/?view=new&p=W1")
    render(<List />)
    act(() => screen.getByRole("button", { name: "Move" }).click())
    expect(readListMemory("/inbox/?view=new")).toEqual({ row: "row-7", scrollY: 0 })
  })

  it("starts afresh on a new visit", () => {
    writeListMemory("/bib/?b=ml", { row: "k1", scrollY: 640 })
    at("/")
    startEntry("/")
    at("/bib/?b=ml")
    render(<List />)
    expect(screen.getByText("restored: nothing")).toBeInTheDocument()
  })

  it("gives back the row on Back", () => {
    writeListMemory("/bib/?b=ml", { row: "k1", scrollY: 640 })
    at("/")
    startEntry("/")
    at("/bib/?b=ml")
    window.dispatchEvent(new PopStateEvent("popstate"))
    render(<List />)
    expect(screen.getByText("restored: k1")).toBeInTheDocument()
  })
})

describe("the list an article is opened from", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    resetPageEntries()
  })

  it("is the list on screen", () => {
    at("/bib/?b=ml&sort=year.asc")
    expect(renderHook(() => useFromHere()).result.current).toBe("/bib/?b=ml&sort=year.asc")
    at("/article/?b=ml&k=x")
    expect(renderHook(() => useFromHere()).result.current).toBeNull()
  })

  it("keeps the order it showed", () => {
    rememberListOrder("/bib/?b=ml&p=ignored", ["ml/a", "ml/b"])
    expect(readListOrder("/bib/?b=ml")).toEqual(["ml/a", "ml/b"])
    expect(readListOrder("/bib/?b=grassland")).toBeNull()
  })

  it("is returned to with Back when it is the previous page", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    at("/bib/?b=ml")
    startEntry("/bib?b=ml")
    at("/article/?b=ml&k=b&from=%2Fbib%2F%3Fb%3Dml")
    startEntry("/article?b=ml&k=b")
    const { result } = renderHook(() => useReturnToList())
    expect(result.current("/bib/?b=ml", "ml/b")).toBe(true)
    expect(back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(readListMemory("/bib/?b=ml")?.row).toBe("ml/b")
  })

  it("is returned to with Back after its URL changed in place (a query typed, a passage read)", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    at("/search/")
    startEntry("/search")
    at("/search/?q=filter&read=ml%2Fa%2Fpaper.pdf%234.1")
    noteEntryHref()
    at("/article/?b=ml&k=a")
    startEntry("/article?b=ml&k=a")
    const { result } = renderHook(() => useReturnToList())
    expect(result.current("/search/?q=filter", "ml/a/paper.pdf#4.1")).toBe(true)
    expect(back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("gives its row back on a return pushed while the window still shows the article", () => {
    writeListMemory("/bib/?b=ml", { row: "ml/b", scrollY: 0 })
    at("/article/?b=ml&k=b")
    startEntry("/article?b=ml&k=b")
    const { result } = renderHook(() => useReturnToList())
    expect(result.current("/bib/?b=ml", "ml/b")).toBe(true)
    // The router renders the list before it writes its URL to the window.
    setNavigation({ pathname: "/bib", search: "b=ml" })
    render(<List />)
    expect(screen.getByText("restored: ml/b")).toBeInTheDocument()
  })

  it("is opened as a return when the reader came from elsewhere", () => {
    at("/article/?b=ml&k=b")
    startEntry("/article?b=ml&k=b")
    const { result } = renderHook(() => useReturnToList())
    expect(result.current("/bib/?b=ml", "ml/b")).toBe(true)
    expect(router.push).toHaveBeenCalledWith("/bib/?b=ml")
    at("/bib/?b=ml")
    expect(startEntry("/bib?b=ml").arrival).toBe("return")
    expect(result.current("https://elsewhere.example/", "x")).toBe(false)
  })
})
