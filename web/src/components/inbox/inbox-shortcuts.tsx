import type { ShortcutSection } from "@/components/shell/shortcuts"
import { RelevanceMark } from "@/components/content/relevance"
import { RELEVANCE, RELEVANCE_LEVELS } from "@/lib/labels"

/**
 * The inbox's keys and signs, as the shortcuts dialog lists them (inbox-view.tsx handles the keys).
 * The letters work on a paper, in the reading pane or with nothing focused, never on another control
 * (WCAG 2.1.4). The legend says what the gutter marks and the prior mean.
 */
export const INBOX_SHORTCUTS: ShortcutSection = {
  title: "Inbox (on a paper or in the reading pane)",
  shortcuts: [
    { keys: [["j"], ["↓"]], label: "Next paper" },
    { keys: [["k"], ["↑"]], label: "Previous paper" },
    { keys: [["a"]], label: "Accept the selection, or the current paper" },
    { keys: [["r"]], label: "Reject the selection, or the current paper" },
    { keys: [["u"]], label: "Undo the last decision (for a few seconds)" },
    { keys: [["Space"], ["⇧", "Space"]], label: "Scroll the paper down or up" },
    { keys: [["Enter"]], label: "Show the whole abstract (on a phone: open the paper)" },
    { keys: [["o"]], label: "Open the article’s page" },
    { keys: [["p"]], label: "Open the PDF" },
    { keys: [["x"]], label: "Select the paper (selection mode)" },
    { keys: [["Esc"]], label: "Clear the selection" },
    { keys: [["v"]], label: "Next view: New, Worth a look, All waiting, Accepted" },
    { keys: [["b"]], label: "Choose the bibliography" },
    { keys: [["s"]], label: "Choose the order" },
    { keys: [["/"]], label: "Filter the papers" },
  ],
  legend: [
    ...RELEVANCE_LEVELS.map((level) => ({
      sign: <RelevanceMark value={level} />,
      meaning: `${RELEVANCE[level].label}: ${lowerFirst(RELEVANCE[level].help)}`,
    })),
    {
      sign: <span className="font-sans text-kbd text-foreground num">0.86</span>,
      meaning:
        "The prior: how close the paper is to the library before any model reads it, from 0 (far) to 1 (close). Papers it finds too far are never read by Haiku.",
    },
  ],
}

function lowerFirst(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text
}
