"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

/*
 * A card shown after a rest of the pointer or the focus on its trigger (an in-collection article
 * link): the popover's surface (paper raised, a hairline, its shadow), popping in from the trigger's
 * side and fading out. The trigger works the same without it (touch screens).
 */
function HoverCard({
  openDelay = 350,
  closeDelay = 120,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return (
    <HoverCardPrimitive.Root
      data-slot="hover-card"
      openDelay={openDelay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 6,
  collisionPadding = 16,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-80 max-w-[calc(100vw-2rem)] origin-(--radix-hover-card-content-transform-origin) rounded-lg bg-popover p-4 font-sans text-sm text-popover-foreground shadow-popover outline-none data-[side=bottom]:[--pop-y:-4px] data-[side=top]:[--pop-y:4px] data-[side=left]:[--pop-x:4px] data-[side=right]:[--pop-x:-4px] data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in print:hidden",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
