/** The synthetic library (tests/fixtures/library.json), parsed by the app's own schema. */
import { LibrarySchema, type Library } from "@/lib/data"

import raw from "../fixtures/library.json"

export const fixtureJson: unknown = raw

/** A fresh parsed copy for each call (tests may mutate it). */
export function fixtureLibrary(): Library {
  return LibrarySchema.parse(structuredClone(raw))
}
