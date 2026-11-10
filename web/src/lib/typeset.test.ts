import { describe, expect, it } from "vitest"

import { typeset, typesetParts, type TypesetPart } from "./typeset"

// Invisible characters by code point (never pasted raw into the source).
const NB = String.fromCharCode(0x00a0) // no-break space
const NN = String.fromCharCode(0x202f) // narrow no-break space
const MINUS = String.fromCharCode(0x2212)
const WJ = String.fromCharCode(0x2060) // word joiner: no line break on either side

/** [input, expected] in English. */
const ENGLISH: [string, string][] = [
  // 1. Dimensions
  ["4x64 sensors", `4${NB}×${NB}64 sensors`],
  ["an 8 x 8 grid", `an 8${NB}×${NB}8 grid`],
  ["3.2 × 3.2 mm2", `3.2${NB}×${NB}3.2${NB}mm²`],
  ["8 x 8 x 4 voxels", `8${NB}×${NB}8${NB}×${NB}4 voxels`],
  // The glue stays short: a line may break before × and before a unit word after it.
  ["4 arrays x 64 channels = 256", `4${NB}arrays ×${NB}64 channels${NB}=${NB}256`],
  ["Probe array: 4 arrays x 64 sensors", `Probe array: 4${NB}arrays ×${NB}64 sensors`],
  ["a 8 x 8 mm grid", `a 8${NB}×${NB}8${NB}mm grid`],
  ["at -4.5 x RMS", `at ${MINUS}4.5${NB}×${NB}RMS`],
  ["fix the x axis at 3", "fix the x axis at 3"],
  ["register 0x1F stays", "register 0x1F stays"],
  ["a 2x faster model", "a 2x faster model"],
  ["box x 5 is a variable", "box x 5 is a variable"],
  // 2. Plus or minus, minus signs
  ["41 +/- 3.7 min", `41${NB}±${NB}3.7${NB}min`],
  ["41 ± 3.7", `41${NB}±${NB}3.7`],
  ["a +/- sign", "a ± sign"],
  ["threshold at -4.5 RMS", `threshold at ${MINUS}4.5 RMS`],
  ["r = -0.42", `r${NB}=${NB}${MINUS}0.42`],
  ["p < 0.05 and n = 12", `p${NB}<${NB}0.05 and n${NB}=${NB}12`],
  ["a < b and x = y", "a < b and x = y"],
  ["CI (-0.2, 0.5)", `CI (${MINUS}0.2, 0.5)`],
  ["-3 dB", `${MINUS}3${NB}dB`],
  ["a well-known effect", "a well-known effect"],
  ["- 3 items", "- 3 items"],
  // 3. Ranges
  ["pp. 4-10", `pp.${NB}4–${WJ}10`],
  ["days 27-148", `days${NB}27–${WJ}148`],
  ["Figures 13a-14b", `Figures${NB}13a–${WJ}14b`],
  ["(P1-P4) and C4-C5", `(P1–${WJ}P4) and C4–${WJ}C5`],
  ["D1-B1 and SAMN03567213-P1", `D1-${WJ}B1 and SAMN03567213-${WJ}P1`],
  ["pp. 5-8 and Fig. 2a-d", `pp.${NB}5–${WJ}8 and Fig.${NB}2a–d`],
  ["0.3-7.5 kHz", `0.3–${WJ}7.5${NB}kHz`],
  ["2009-2026", `2009–${WJ}2026`],
  ["1990-91", `1990–${WJ}91`],
  ["14–33% written with its dash", `14–${WJ}33% written with its dash`],
  ["a 4–10 ms window", `a 4–${WJ}10${NB}ms window`],
  ["published 2023-08", "published 2023-08"],
  ["on 2023-08-01", "on 2023-08-01"],
  ["ISBN 978-3-16-148410-0", "ISBN 978-3-16-148410-0"],
  ["plot S12-3", "plot S12-3"],
  ["COVID-19 cohorts", "COVID-19 cohorts"],
  ["a 50-word abstract", `a 50-${WJ}word abstract`],
  ["a 125,000-word corpus, 10-fold", `a 125,000-${WJ}word corpus, 10-${WJ}fold`],
  ["from 9:00-17:00", "from 9:00-17:00"],
  // 4. Units and numbers
  ["9.1 % relative error", `9.1${NB}% relative error`],
  ["9.1% stays tight", "9.1% stays tight"],
  ["50 ms bins at 30 kHz", `50${NB}ms bins at 30${NB}kHz`],
  ["in 5 s, then 2 h", `in 5${NB}s, then 2${NB}h`],
  ["5 sessions", "5 sessions"],
  ["12 sensors and 1 array", `12${NB}sensors and 1${NB}array`],
  ["250 trials over 5 days", `250${NB}trials over 5${NB}days`],
  ["at 37 °C", `at 37${NB}°C`],
  ["50 µV and 2 μV", `50${NB}µV and 2${NB}μV`],
  ["see p. 5 and pp. 13-14", `see p.${NB}5 and pp.${NB}13–${WJ}14`],
  ["§ 1.1 and Fig. 3D, Table S1", `§${NB}1.1 and Fig.${NB}3D, Table${NB}S1`],
  ["an app. 5 times", "an app. 5 times"],
  ["approximately 90% (Plot 1)", `approximately 90% (Plot${NB}1)`],
  ["day 22 and session 18, plot 44", `day${NB}22 and session${NB}18, plot${NB}44`],
  ["1.5 mm-length shanks", `1.5${NB}mm-${WJ}length shanks`],
  // 5. Powers
  ["a 3 mm2 patch", `a 3${NB}mm² patch`],
  ["10 cm3 of saline", `10${NB}cm³ of saline`],
  ["per mm2", "per mm²"],
  ["area M2 and m2 alone", "area M2 and m2 alone"],
  // 6. Ellipses and author lists
  ["and so on...", "and so on…"],
  ["A, B, … , Z", "A, B … Z"],
  // 7. Quotes and apostrophes
  ["Darwin's finches", "Darwin’s finches"],
  ["the plots' data", "the plots’ data"],
  ["don't", "don’t"],
  ["the '90s", "the ’90s"],
  ['the "dry spell" task', "the “dry spell” task"],
  ["a 'quoted' word", "a ‘quoted’ word"],
  ['("nested")', "(“nested”)"],
  ["5'10\" tall", "5′10″ tall"],
]

/** [input, expected] in French. */
const FRENCH: [string, string][] = [
  ["une précision de 39,48 %", `une précision de 39,48${NN}%`],
  ["une précision de 39,48%", `une précision de 39,48${NN}%`],
  ["Quand ? Parce que !", `Quand${NN}? Parce que${NN}!`],
  ["Note : le champ", `Note${NN}: le champ`],
  ["Note: le champ", `Note${NN}: le champ`],
  ["deux points ; trois", `deux points${NN}; trois`],
  ["à 12:30 et 1:2", "à 12:30 et 1:2"],
  ["\u00AB bonjour \u00BB", `\u00AB${NN}bonjour${NN}\u00BB`],
  ['le "Open Soil Data" corpus', `le \u00AB${NN}Open Soil Data${NN}\u00BB corpus`],
  ["environ 131 000 paramètres", `environ 131${NN}000 paramètres`],
  ["1 250 000 mots", `1${NN}250${NN}000 mots`],
  ["en 2023 300 patients", "en 2023 300 patients"],
  ["l'ADN et d'abord", "l’ADN et d’abord"],
  ["?!", "?!"],
]

describe("typeset: English", () => {
  it.each(ENGLISH)("%j", (input, expected) => {
    expect(typeset(input)).toBe(expected)
  })
})

describe("typeset: French", () => {
  it.each(FRENCH)("%j", (input, expected) => {
    expect(typeset(input, "fr")).toBe(expected)
  })

  it("leaves French punctuation alone in English text", () => {
    expect(typeset("Why? Because!")).toBe("Why? Because!")
    expect(typeset("39,48 %")).toBe(`39,48${NB}%`)
  })
})

describe("typeset: what it never touches", () => {
  it.each([
    "https://doi.org/10.5555/x-1-2?a=1&b=2",
    "doi:10.5555/jie.2026.0412",
    "10.5555/sfr.2025.1042",
    "library/ml/articles/novak2024/paper.pdf",
    "fig-3_2023-08.png",
    "`glossator inbox run --since 2023-08-01`",
    "PMID 37612500",
    "PMC10234567",
    "arXiv:2401.01234",
    "a.person@example.org",
  ])("%s", (token) => {
    expect(typeset(token)).toBe(token)
    expect(typeset(`see ${token} (p. 4)`)).toBe(`see ${token} (p.${NB}4)`)
  })

  it("keeps a sentence's punctuation out of an address", () => {
    expect(typeset("at https://example.org/a-1. Then 4-6")).toBe(
      `at https://example.org/a-1. Then 4–${WJ}6`
    )
    expect(typeset("(doi:10.5555/x-1) 4-6")).toBe(`(doi:10.5555/x-1) 4–${WJ}6`)
  })

  it("protects addresses from the French rules", () => {
    expect(typeset("voir https://example.org/?q=1 !", "fr")).toBe(
      `voir https://example.org/?q=1${NN}!`
    )
  })

  it("returns empty text and text holding private-use characters as they are", () => {
    expect(typeset("")).toBe("")
    const odd = `a${String.fromCharCode(0xe000)}b 4-6`
    expect(typeset(odd)).toBe(odd)
  })
})

describe("typeset: markup", () => {
  const abbr = (text: string): TypesetPart => ({ t: "abbr", text })

  it("marks acronyms in serif text, the plural s outside", () => {
    expect(typesetParts("A GPU for NDVI and two GPUs", { acronyms: true })).toEqual([
      "A ",
      abbr("GPU"),
      " for ",
      abbr("NDVI"),
      " and two ",
      abbr("GPU"),
      "s",
    ])
  })

  it("leaves mixed forms, numerals, single capitals and shouting alone", () => {
    expect(
      typesetParts("LiDAR, qPCR, S4ND, S12, Phase II, Table XIV, a I", { acronyms: true })
    ).toEqual([`LiDAR, qPCR, S4ND, S12, Phase II, Table${NB}XIV, a I`])
    expect(typesetParts("SOURCE DATA FILE", { acronyms: true })).toEqual(["SOURCE DATA FILE"])
  })

  it("never splits a name joined to a figure, and marks each of a slashed list", () => {
    const marked = (text: string) =>
      typesetParts(text, { acronyms: true })
        .map((p) => (typeof p === "string" ? p : p.t === "abbr" ? `[${p.text}]` : p.text))
        .join("")
    expect(marked("plot 6b (ISO-8601; dry)")).toBe(`plot${NB}6b (ISO-8601; dry)`)
    expect(marked("COVID-19 and CIFAR-10 sets")).toBe("COVID-19 and CIFAR-10 sets")
    expect(marked("GPS-1100 receiver and GPS data")).toBe("GPS-1100 receiver and [GPS] data")
    expect(marked("NDVI-EVI 26 in NDVI")).toBe("[NDVI]-[EVI] 26 in [NDVI]")
    expect(marked("RNN/CNN/LR in one")).toBe("[RNN]/[CNN]/[LR] in one")
    expect(marked("S12-ABC")).toBe(`S12-${WJ}ABC`)
  })

  it("marks no acronym unless asked (the sans has no small caps)", () => {
    expect(typesetParts("A GPU")).toEqual(["A GPU"])
  })

  it("marks no acronym inside an address or a file name", () => {
    expect(
      typesetParts("GPS at https://example.org/GPS/GIS/x and GIS", { acronyms: true })
    ).toEqual([abbr("GPS"), " at https://example.org/GPS/GIS/x and ", abbr("GIS")])
    expect(typesetParts("GPS/GIS data", { acronyms: true })).toEqual([
      abbr("GPS"),
      "/",
      abbr("GIS"),
      " data",
    ])
  })

  it("writes scientific notation with a superscript", () => {
    expect(typesetParts("p < 1.2e-5 here")).toEqual([
      `p${NB}<${NB}1.2${NB}×${NB}10`,
      { t: "sup", text: `${MINUS}5` },
      " here",
    ])
    expect(typeset("p < 1.2e-5")).toBe(`p${NB}<${NB}1.2${NB}×${NB}10⁻⁵`)
    expect(typeset("id ab1e-5")).toBe("id ab1e-5")
  })

  it("writes a power of ten given in full with a superscript", () => {
    expect(typesetParts("1.69 × 10-09 here")).toEqual([
      `1.69${NB}×${NB}10`,
      { t: "sup", text: `${MINUS}9` },
      " here",
    ])
    expect(typeset("p = 1.69 x 10-09")).toBe(`p${NB}=${NB}1.69${NB}×${NB}10⁻⁹`)
    expect(typeset("p = 1.69 × 10–09")).toBe(`p${NB}=${NB}1.69${NB}×${NB}10⁻⁹`)
    expect(typeset("3 x 10^-4 and 2×10^5")).toBe(`3${NB}×${NB}10⁻⁴ and 2${NB}×${NB}10⁵`)
    expect(typeset("a 4 x 10 grid")).toBe(`a 4${NB}×${NB}10 grid`)
  })

  it("turns an author count into a muted aside", () => {
    expect(typesetParts("Ana Ferraz, Kwame Mensah, … , Ruth Abernathy (12 authors)")).toEqual([
      "Ana Ferraz, Kwame Mensah … Ruth Abernathy ",
      { t: "muted", text: `· 12${NB}authors` },
    ])
  })
})

describe("typeset: idempotent", () => {
  it.each([...ENGLISH, ...FRENCH].map(([input]) => input))("%j", (input) => {
    const fr = typeset(input, "fr")
    expect(typeset(fr, "fr")).toBe(fr)
    const en = typeset(input)
    expect(typeset(en)).toBe(en)
  })
})
