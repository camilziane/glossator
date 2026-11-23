import type { ReactNode } from "react"

import { FAMILY_TEXT, type Identity } from "@/lib/identity"
import { cn } from "@/lib/utils"

/**
 * An identity's icon in its family's ink (`@/lib/identity`), decorative: the words beside it name
 * the type. Nothing for an identity without an icon (a label its profile leaves out).
 */
export function IdentityIcon({
  identity,
  className,
}: {
  identity: Identity | null
  className?: string
}) {
  if (!identity?.icon) return null
  const Icon = identity.icon
  return (
    <Icon
      aria-hidden="true"
      data-family={identity.family}
      className={cn("size-4 shrink-0", FAMILY_TEXT[identity.family], className)}
    />
  )
}

/**
 * A label marked by its identity: the icon, then the words in the family's ink (the sans,
 * semibold, small). Without an identity, the words in the muted ink.
 */
export function IdentityLabel({
  identity,
  children,
  className,
}: {
  identity: Identity | null
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        // Top-aligned: a label with an icon and one without stand on the same line.
        "inline-flex max-w-full items-center gap-1.5 align-top font-sans text-small font-semibold",
        identity ? FAMILY_TEXT[identity.family] : "text-muted-foreground",
        className
      )}
    >
      <IdentityIcon identity={identity} />
      <span className="min-w-0">{children}</span>
    </span>
  )
}
