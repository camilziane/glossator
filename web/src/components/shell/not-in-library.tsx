import Link from "next/link"

import { routes } from "@/lib/routes"

import { ErrorText } from "./data-error"
import { Page } from "./page"

/** A route whose params name nothing in the library (a removed article, a mistyped link). */
export function NotInLibrary({ what, name }: { what: "article" | "bibliography"; name: string }) {
  return (
    <Page width="glossed">
      <ErrorText title={`No such ${what}`}>
        {name ? (
          <>
            The library has no {what} <code>{name}</code>.{" "}
          </>
        ) : (
          <>This link names no {what}. </>
        )}
        <Link href={routes.overview()} className="link">
          Back to Today
        </Link>
        .
      </ErrorText>
    </Page>
  )
}
