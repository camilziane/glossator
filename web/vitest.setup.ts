import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { toast } from "sonner"
import { afterEach, vi } from "vitest"

import { resetNavigation } from "./tests/utils/navigation"

// next/navigation outside Next: a controllable fake (tests/utils/navigation.ts).
vi.mock("next/navigation", () => import("./tests/utils/navigation"))

afterEach(() => {
  cleanup()
  resetNavigation()
  // Toasts live in sonner's module state: a new Toaster would show the last test's.
  toast.dismiss()
})

// What jsdom lacks and Radix, cmdk, next-themes and the sidebar use.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
// jsdom logs "not implemented" for window scrolling (a virtual list scrolls to an item).
window.scrollTo = () => {}
