/**
 * A fake of next/navigation for unit tests (wired in vitest.setup.ts). Set where the test is with
 * `setNavigation({ pathname: "/bib/", search: "b=ml" })`; read what the code did in `router.push`
 * and `router.replace` (vi.fn).
 */
import { vi } from "vitest"

const state = { pathname: "/", search: new URLSearchParams() }

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}

export function setNavigation({
  pathname = "/",
  search = "",
}: {
  pathname?: string
  search?: string
}) {
  state.pathname = pathname
  state.search = new URLSearchParams(search)
}

export function resetNavigation() {
  setNavigation({})
  for (const fn of Object.values(router)) fn.mockReset()
}

export function useRouter() {
  return router
}

export function usePathname() {
  return state.pathname
}

export function useSearchParams() {
  return state.search
}

export function useParams() {
  return {}
}

export function notFound(): never {
  throw new Error("notFound()")
}

export function redirect(url: string): never {
  throw new Error(`redirect(${url})`)
}
