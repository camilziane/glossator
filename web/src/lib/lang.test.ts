import { describe, expect, it } from "vitest"

import { guessLang } from "./lang"

describe("guessLang", () => {
  it("tells a few languages from English by their short words", () => {
    expect(guessLang("Une mesure de la sécheresse sur des prairies du nord.")).toBe("fr")
    expect(
      guessLang("Drenaje nocturno medido en una pradera inventada, con los sensores del sur.")
    ).toBe("es")
    expect(guessLang("Eine erfundene Messung der Trockenheit auf den Wiesen und im Wald.")).toBe(
      "de"
    )
    expect(guessLang("Una misura inventata della siccità nei prati del nord.")).toBe("it")
    expect(guessLang("Uma medida inventada da seca nos campos, com os sensores do sul.")).toBe("pt")
  })

  it("says nothing for English, a mix, or too little", () => {
    expect(
      guessLang("An invented study of the stability of sensor grids over three years.")
    ).toBeUndefined()
    expect(
      guessLang("Über Modellvergleiche: a bilingual benchmark of invented models")
    ).toBeUndefined()
    expect(guessLang("Drenaje")).toBeUndefined()
    expect(guessLang("")).toBeUndefined()
    expect(guessLang(null)).toBeUndefined()
  })
})
