import { Badge } from "@/components/ui/badge"
import { doiHref, isSeriousNotice, type Notice } from "@/lib/data"
import { formatDate } from "@/lib/format"
import { noticeLabel, noticeSentence } from "@/lib/labels"

/** The notice itself: its title, linked to its DOI. */
function NoticeLink({ notice }: { notice: Notice }) {
  const href = doiHref(notice.doi)
  const title = notice.title || notice.label || "the notice"
  if (!href) return <cite className="not-italic">{title}</cite>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link">
      <cite className="not-italic">{title}</cite>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function when(notice: Notice): string {
  return notice.date ? ` on ${formatDate(notice.date)}` : ""
}

/**
 * Crossref notices about the article. A retraction, withdrawal, removal or expression of concern is
 * said first, in danger words on the paper (a hairline on its left, no box, no icon): the word, the
 * sentence, the notice. A correction (or any other notice) is a quiet line under the venue.
 */
export function ArticleNotices({
  notices,
  placement,
}: {
  notices: readonly Notice[]
  /** "serious" draws the warnings, "quiet" the notes: the header puts them in different places. */
  placement: "serious" | "quiet"
}) {
  const shown = notices.filter((n) => isSeriousNotice(n) === (placement === "serious"))
  if (shown.length === 0) return null
  if (placement === "serious") {
    return (
      <div className="mb-7 space-y-4">
        {shown.map((notice, i) => {
          const badge = noticeLabel(notice)
          return (
            <section
              key={i}
              aria-label={`Notice: ${badge}`}
              className="max-w-measure border-l-2 border-danger pl-4"
            >
              <p className="font-serif text-read text-danger">
                <Badge variant="destructive" className="mr-2">
                  {badge}
                </Badge>
                {noticeSentence(notice)}
                {when(notice)}.
              </p>
              <p className="mt-1 font-sans text-small text-pretty text-foreground">
                <NoticeLink notice={notice} />
                {notice.doi ? (
                  <span className="text-muted-foreground"> · doi:{notice.doi}</span>
                ) : null}
                <span className="text-muted-foreground">
                  {" "}
                  · Read the notice before relying on the findings summarised below.
                </span>
              </p>
            </section>
          )
        })}
      </div>
    )
  }
  return (
    <div className="mt-2 space-y-1">
      {shown.map((notice, i) => (
        <p key={i} className="font-sans text-small text-pretty text-muted-foreground">
          <Badge variant="secondary" className="mr-1.5">
            {noticeLabel(notice)}
          </Badge>
          {noticeSentence(notice)}
          {when(notice)}: <NoticeLink notice={notice} />.
        </p>
      ))}
    </div>
  )
}
