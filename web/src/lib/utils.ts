import { createCn } from "cn/config"

/**
 * Join class names and resolve Tailwind conflicts (the later class wins), taught the theme's own
 * tokens (globals.css `@theme`). Without them `text-small` reads as a text colour and is dropped
 * next to `text-muted-foreground`, and `shadow-popover` as a shadow colour.
 */
export const cn = createCn({
  extend: {
    theme: {
      // The type scale (ARCHITECTURE 3.2): each sets the size and the line height.
      text: [
        "display",
        "title",
        "lede",
        "read",
        "note",
        "item",
        "gloss",
        "ui",
        "table",
        "small",
        "label",
        "kbd",
      ],
      // max-w-measure, max-w-page.
      container: ["measure", "page"],
      shadow: ["popover"],
      animate: [
        "fade-in",
        "fade-out",
        "pop-in",
        "pop-out",
        "dialog-in",
        "dialog-out",
        "skeleton-in",
        "indeterminate",
      ],
    },
  },
})
