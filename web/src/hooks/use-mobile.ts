import { useMediaQuery } from "./use-media-query"

const MOBILE_BREAKPOINT = 768

/** Below md (768 px): the phone layout (the tab bar at the bottom), sheets open from the bottom. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}
