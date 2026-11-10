"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { loadLibrary } from "@/lib/data"
import { legacyHashTarget, normalizePath } from "@/lib/routes"

/**
 * Links to the former single page (`/#<bib>/<key>/<section>`, `/#<bib>`, `/#inbox`) still work:
 * on "/", such a hash is replaced by the route that now shows it.
 */
export function LegacyHashRedirect() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (normalizePath(pathname) !== "/") return
    let cancelled = false
    const redirect = async () => {
      const hash = window.location.hash
      if (hash.length < 2) return
      // Two- and three-part hashes and #inbox need no data; a one-part hash must name a bibliography.
      let target = legacyHashTarget(hash, new Set())
      if (target === null && !hash.slice(1).includes("/")) {
        try {
          target = legacyHashTarget(hash, (await loadLibrary()).bibNames)
        } catch {
          return // the page itself says why the library did not load
        }
      }
      if (target !== null && !cancelled) router.replace(target)
    }
    void redirect()
    window.addEventListener("hashchange", redirect)
    return () => {
      cancelled = true
      window.removeEventListener("hashchange", redirect)
    }
  }, [pathname, router])

  return null
}
