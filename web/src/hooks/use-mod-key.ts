import { useSyncExternalStore } from "react"

const noSubscription = () => () => {}

function readIsApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || "")
}

/** Whether the keyboard's modifier is ⌘ (Apple systems); false before hydration. */
export function useIsApple(): boolean {
  return useSyncExternalStore(noSubscription, readIsApple, () => false)
}

/** "⌘" on Apple systems, "Ctrl" elsewhere (and before hydration). */
export function useModKey(): "⌘" | "Ctrl" {
  return useIsApple() ? "⌘" : "Ctrl"
}
