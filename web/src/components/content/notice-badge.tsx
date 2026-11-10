import { Badge } from "@/components/ui/badge"
import { isSeriousNotice, type Notice } from "@/lib/data"
import { formatDate } from "@/lib/format"
import { noticeLabel, seriousNotice } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * A notice about an article, as a word in small caps: a retraction, withdrawal, removal or expression
 * of concern in danger ink ("Retracted"), a correction muted ("Corrected"). No pill, no icon: the word
 * carries it. The same everywhere an article is listed; its title says the notice in full.
 */
export function NoticeBadge({ notice, className }: { notice: Notice; className?: string }) {
  const serious = isSeriousNotice(notice)
  const label = noticeLabel(notice)
  const when = notice.date ? ` (${formatDate(notice.date)})` : ""
  return (
    <Badge
      variant={serious ? "destructive" : "secondary"}
      title={`${notice.label || label}${when}${notice.title ? `: ${notice.title}` : ""}`}
      className={className}
    >
      {label}
    </Badge>
  )
}

/** The badge of an article's gravest notice, or nothing (a correction alone stays quiet). */
export function SeriousNoticeBadge({
  notices,
  className,
}: {
  notices: readonly Notice[]
  className?: string
}) {
  const notice = seriousNotice(notices)
  return notice ? <NoticeBadge notice={notice} className={className} /> : null
}

/** A badge for each notice, serious ones first, separated by a middle dot. */
export function NoticeBadges({
  notices,
  className,
}: {
  notices: readonly Notice[]
  className?: string
}) {
  if (notices.length === 0) return null
  const ordered = [
    ...notices.filter(isSeriousNotice),
    ...notices.filter((n) => !isSeriousNotice(n)),
  ]
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      {ordered.map((notice, i) => (
        <span key={`${notice.doi}-${i}`} className="inline-flex items-baseline gap-x-1.5">
          {i > 0 ? (
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
          ) : null}
          <NoticeBadge notice={notice} />
        </span>
      ))}
    </span>
  )
}

/** A draft (an article still being curated): the word in warning ink, small caps. */
export function DraftBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      Draft
    </Badge>
  )
}
