/**
 * Identities: how the app marks a kind of information wherever it shows it. The icon names the type
 * (an author, a journal, the problem, the model…) and its family's ink the role (ARCHITECTURE.md
 * 3.1): who and where, why, how, on what, how much, the documents. A bibliography's profile marks
 * its own sections and labels (`Bibliography.identities`, written by profiles.identities); the app
 * marks what it draws itself (an article's reference, where a search match comes from).
 */
import {
  ActivityIcon,
  ArrowRightFromLineIcon,
  ArrowRightToLineIcon,
  Axis3dIcon,
  BookOpenIcon,
  BoxIcon,
  ChartColumnIcon,
  CircleQuestionMarkIcon,
  ClipboardListIcon,
  CodeXmlIcon,
  CpuIcon,
  DatabaseIcon,
  DraftingCompassIcon,
  DumbbellIcon,
  FileTextIcon,
  FlaskConicalIcon,
  GlobeIcon,
  HammerIcon,
  HashIcon,
  HistoryIcon,
  ImageIcon,
  LandmarkIcon,
  LayersIcon,
  LightbulbIcon,
  LinkIcon,
  MapPinIcon,
  MessagesSquareIcon,
  NetworkIcon,
  NotebookPenIcon,
  PaperclipIcon,
  PersonStandingIcon,
  PuzzleIcon,
  QuoteIcon,
  RulerIcon,
  ScanTextIcon,
  SearchIcon,
  StethoscopeIcon,
  TagIcon,
  TargetIcon,
  TextQuoteIcon,
  TypeIcon,
  UserIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import type { Identities, Mark } from "@/lib/data"

/** The families, in the order a page reads them: who and where, why, how, on what, how much, the documents. */
export const FAMILIES = ["reference", "framing", "method", "data", "results", "documents"] as const
export type Family = (typeof FAMILIES)[number]

export interface Identity {
  /** None for a label its profile leaves out: it takes its section's family alone. */
  icon: LucideIcon | null
  family: Family
}

/** Each family's ink, as a text colour: an icon and its label take it. */
export const FAMILY_TEXT: Readonly<Record<Family, string>> = {
  reference: "text-id-reference",
  framing: "text-id-framing",
  method: "text-id-method",
  data: "text-id-data",
  results: "text-id-results",
  documents: "text-id-documents",
}

/**
 * The icons a profile may name, by lucide's names: the same set as `profiles.ICONS` in Python (a
 * test there reads this list, one icon a line).
 */
export const ICONS: Readonly<Record<string, LucideIcon>> = {
  activity: ActivityIcon,
  "arrow-right-from-line": ArrowRightFromLineIcon,
  "arrow-right-to-line": ArrowRightToLineIcon,
  "axis-3d": Axis3dIcon,
  "book-open": BookOpenIcon,
  box: BoxIcon,
  "chart-column": ChartColumnIcon,
  "circle-question-mark": CircleQuestionMarkIcon,
  "clipboard-list": ClipboardListIcon,
  "code-xml": CodeXmlIcon,
  cpu: CpuIcon,
  database: DatabaseIcon,
  "drafting-compass": DraftingCompassIcon,
  dumbbell: DumbbellIcon,
  "file-text": FileTextIcon,
  "flask-conical": FlaskConicalIcon,
  globe: GlobeIcon,
  hammer: HammerIcon,
  hash: HashIcon,
  history: HistoryIcon,
  image: ImageIcon,
  landmark: LandmarkIcon,
  layers: LayersIcon,
  lightbulb: LightbulbIcon,
  link: LinkIcon,
  "map-pin": MapPinIcon,
  "messages-square": MessagesSquareIcon,
  network: NetworkIcon,
  "notebook-pen": NotebookPenIcon,
  paperclip: PaperclipIcon,
  "person-standing": PersonStandingIcon,
  puzzle: PuzzleIcon,
  quote: QuoteIcon,
  ruler: RulerIcon,
  "scan-text": ScanTextIcon,
  search: SearchIcon,
  stethoscope: StethoscopeIcon,
  tag: TagIcon,
  target: TargetIcon,
  "text-quote": TextQuoteIcon,
  type: TypeIcon,
  user: UserIcon,
  users: UsersIcon,
  workflow: WorkflowIcon,
}

const mark = (icon: LucideIcon, family: Family): Identity => ({ icon, family })

/** What the app marks itself: an article's reference, and where a search match comes from. */
export const APP = {
  author: mark(UserIcon, "reference"),
  university: mark(LandmarkIcon, "reference"),
  journal: mark(BookOpenIcon, "reference"),
  identifiers: mark(HashIcon, "reference"),
  title: mark(TypeIcon, "reference"),
  cites: mark(QuoteIcon, "reference"),
  paper: mark(FileTextIcon, "documents"),
  supplementary: mark(PaperclipIcon, "documents"),
  review: mark(MessagesSquareIcon, "documents"),
  quote: mark(TextQuoteIcon, "documents"),
  figures: mark(ImageIcon, "documents"),
  curation: mark(NotebookPenIcon, "documents"),
} as const satisfies Record<string, Identity>

function isFamily(name: string): name is Family {
  return (FAMILIES as readonly string[]).includes(name)
}

/** A profile's mark as an identity: an unknown family marks nothing, an unknown icon draws none. */
export function fromMark(found: Mark | undefined): Identity | null {
  if (!found) return null
  const [name, family] = found
  if (!isFamily(family)) return null
  return { icon: Object.hasOwn(ICONS, name) ? (ICONS[name] ?? null) : null, family }
}

function own(map: Readonly<Record<string, Mark>>, key: string): Mark | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

/** A section's identity, by its id ("overview", "details"…): its profile's mark, or none. */
export function sectionIdentity(identities: Identities, id: string): Identity | null {
  return fromMark(own(identities.sections, id))
}

/**
 * A label's identity (a field's, a tile's), as the view writes it ("Problem"): its profile's mark;
 * else, in a section, the section's family without an icon; else none.
 */
export function labelIdentity(
  identities: Identities,
  label: string,
  sectionId?: string
): Identity | null {
  const found = fromMark(own(identities.labels, label))
  if (found) return found
  const section = sectionId === undefined ? null : sectionIdentity(identities, sectionId)
  return section ? { icon: null, family: section.family } : null
}

/** No marks: a bibliography written before identities, or a card built by hand. */
export const NO_IDENTITIES: Identities = { sections: {}, labels: {} }
