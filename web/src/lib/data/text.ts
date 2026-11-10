import type { Inlines } from "./schema"

/** Inline parts as plain text (sitedata.plain): for titles, aria labels, sorting and search. */
export function plainText(parts: Inlines): string {
  let out = ""
  for (const p of parts) out += typeof p === "string" ? p : p.text
  return out
}

/** Text folded for matching: lower case, accents removed ("Über" → "uber"). */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
}
