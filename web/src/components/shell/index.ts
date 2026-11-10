// The shared frame and its building blocks: import from "@/components/shell".
export { ClientOnly, useIsClient } from "./client-only"
export { useCommandPalette, type CommandPaletteControl } from "./command-palette-context"
export { DataErrorNotice, ErrorText } from "./data-error"
export { DataProblems } from "./data-problems"
export { ErrorBoundary } from "./error-boundary"
export { focusPageFilter, PAGE_FILTER_ATTR } from "./global-keys"
export { LibraryBoundary } from "./library-boundary"
export { glossGrid, Page, PageHeader, type PageWidth } from "./page"
export { PageSkeleton, type PageSkeletonVariant } from "./page-skeleton"
export { ProfileIcon } from "./profile-icon"
export {
  GLOBAL_SHORTCUTS,
  KeyCap,
  Keys,
  ShortcutsProvider,
  usePageShortcuts,
  useShortcuts,
  type Shortcut,
  type ShortcutSection,
} from "./shortcuts"
export {
  StatusLine,
  useStatusLine,
  type StatusAction,
  type StatusLineControl,
  type StatusOptions,
} from "./status-line"
export { NotInLibrary } from "./not-in-library"
