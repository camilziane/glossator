import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Notice } from "@/lib/data"

import { ArticleNotices } from "./article-notices"

const notice = (type: string, extra: Partial<Notice> = {}): Notice => ({
  type,
  label: type,
  doi: "10.5555/invented.notice",
  date: "2026-02-03",
  title: `An invented ${type} notice`,
  ...extra,
})

describe("article notices", () => {
  it("draws serious notices as banners and the others as notes", () => {
    const notices = [notice("expression_of_concern"), notice("correction")]
    const { rerender } = render(<ArticleNotices notices={notices} placement="serious" />)
    const banner = screen.getByRole("region", { name: "Notice: Expression of concern" })
    expect(banner).toHaveTextContent(
      "The publisher issued an expression of concern about this article on 3 Feb 2026."
    )
    expect(screen.queryByText(/correction/)).toBeNull()

    rerender(<ArticleNotices notices={notices} placement="quiet" />)
    expect(screen.queryByRole("region")).toBeNull()
    expect(
      screen.getByText(/A correction to this article was published on 3 Feb 2026/)
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /An invented correction notice/ })).toHaveAttribute(
      "href",
      "https://doi.org/10.5555/invented.notice"
    )
  })
})
