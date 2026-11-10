import { render } from "@testing-library/react"
import { type ReactElement } from "react"
import { describe, expect, it } from "vitest"

import { FigureText, MetricText } from "./cells"

function bold(node: ReactElement): string[] {
  const { container } = render(<p>{node}</p>)
  return [...container.querySelectorAll("strong")].map((s) =>
    (s.textContent ?? "").replace(/[\u00a0\u202f]/g, " ")
  )
}

describe("figures in bold", () => {
  it("sets only the figures of a value in bold", () => {
    expect(bold(<FigureText text="about 90% then 0.5 +/- 0.1 over 1,200 words" />)).toEqual([
      "90%",
      "0.5",
      // A sign goes with its figure.
      "± 0.1",
      "1,200",
    ])
  })

  it("leaves the punctuation after a figure regular", () => {
    expect(bold(<FigureText text="p = 0.684, then 12." />)).toEqual(["0.684", "12"])
  })

  it("leaves identifiers alone", () => {
    expect(bold(<FigureText text="P1 and S12-3 at 4 sites, p = 0.05" />)).toEqual(["4", "0.05"])
  })

  it("keeps a value without figures bold whole", () => {
    expect(bold(<FigureText text="above chance" />)).toEqual(["above chance"])
  })

  it("never sets a confidence interval or what a parenthesis says in bold", () => {
    expect(bold(<FigureText text="9.1% (95% CI 7.2, 11.2)" />)).toEqual(["9.1%"])
    expect(bold(<FigureText text="about 90% (Plot 1)" />)).toEqual(["90%"])
  })

  it("puts a value's label after an en space, in muted ink", () => {
    const { container } = render(
      <p>
        <MetricText
          parts={[
            { t: "b", text: "12%" },
            " ",
            "error rate",
            "; ",
            { t: "b", text: "3" },
            " units",
          ]}
        />
      </p>
    )
    expect(container.textContent).toBe("12%\u2002error rate; 3\u2002units")
    const muted = [...container.querySelectorAll(".text-muted-foreground")].map(
      (e) => e.textContent
    )
    expect(muted).toEqual(["error rate", "units"])
  })

  it("follows the data's emphasis in a metrics cell", () => {
    expect(
      bold(<MetricText parts={[{ t: "b", text: "12 of 20" }, " units at 5 sites"]} />)
    ).toEqual(["12", "20"])
    expect(bold(<MetricText parts={["at 5 sites"]} everywhere />)).toEqual(["5"])
  })
})
