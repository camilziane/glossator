import {
  ActivityIcon,
  BookMarkedIcon,
  CpuIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  ml: CpuIcon,
  epidemio: ActivityIcon,
}

/** A bibliography's icon, by its profile (the built-in ml and epidemio; a book for any other). */
export function ProfileIcon({ profile, ...props }: { profile: string } & LucideProps) {
  const Icon = ICONS[profile] ?? BookMarkedIcon
  return <Icon aria-hidden {...props} />
}
