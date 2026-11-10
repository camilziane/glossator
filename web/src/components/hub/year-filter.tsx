"use client"

import { Slider as SliderPrimitive } from "radix-ui"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { formatYearSpan } from "./model"
import { type YearRange } from "./url-state"
import { MenuButton } from "./view-options"

// An ink ring on the paper; a wider hit area; the app's one focus outline.
const THUMB =
  "relative block size-3.5 shrink-0 rounded-full border-2 border-foreground bg-background transition-transform duration-150 select-none after:absolute after:-inset-2.5 hover:scale-110 active:scale-95"

/** The year range of the Articles table: a two-thumb slider and two fields, bounded by the data. */
export function YearFilter({
  bounds,
  value,
  onChange,
  histogram,
}: {
  bounds: readonly [number, number]
  value: YearRange | null
  onChange: (range: YearRange | null) => void
  /** Articles per year (every article), drawn above the slider. */
  histogram: ReadonlyMap<number, number>
}) {
  const id = useId()
  const [min, max] = bounds
  const from = clamp(value?.from ?? min, min, max)
  const to = clamp(value?.to ?? max, min, max)
  const active = value !== null

  // A range covering every year is no filter at all.
  const commit = (a: number, b: number) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    onChange(
      lo <= min && hi >= max ? null : { from: lo <= min ? null : lo, to: hi >= max ? null : hi }
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <MenuButton value={active ? formatYearSpan([from, to]) : undefined}>Year</MenuButton>
      </PopoverTrigger>
      <PopoverContent className="w-72 gap-3 p-4" align="start">
        <div className="flex items-baseline justify-between gap-2">
          <p className="label" id={`${id}-title`}>
            Published
          </p>
          <p className="text-sm num">{formatYearSpan([from, to])}</p>
        </div>
        <Histogram bounds={bounds} counts={histogram} from={from} to={to} />
        <SliderPrimitive.Root
          min={min}
          max={max}
          step={1}
          minStepsBetweenThumbs={0}
          value={[from, to]}
          onValueChange={(v) => commit(v[0] ?? min, v[1] ?? max)}
          aria-labelledby={`${id}-title`}
          className="relative flex h-5 w-full touch-none items-center select-none"
        >
          <SliderPrimitive.Track className="relative h-px grow bg-input">
            <SliderPrimitive.Range className="absolute -top-px h-[3px] bg-foreground" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb aria-label="First year" className={THUMB} />
          <SliderPrimitive.Thumb aria-label="Last year" className={THUMB} />
        </SliderPrimitive.Root>
        <div className="grid grid-cols-2 gap-3">
          <YearField
            id={`${id}-from`}
            label="From"
            value={from}
            bounds={bounds}
            onCommit={(n) => commit(n, Math.max(n, to))}
          />
          <YearField
            id={`${id}-to`}
            label="To"
            value={to}
            bounds={bounds}
            onCommit={(n) => commit(Math.min(from, n), n)}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="self-end"
          disabled={!active}
          onClick={() => onChange(null)}
        >
          Every year
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** A year typed digit by digit: committed once it is a year within the bounds, reset on leaving. */
function YearField({
  id,
  label,
  value,
  bounds,
  onCommit,
}: {
  id: string
  label: string
  value: number
  bounds: readonly [number, number]
  onCommit: (year: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [min, max] = bounds
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="label">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft ?? String(value)}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          const n = Number(text)
          if (/^\d{4}$/.test(text) && n >= min && n <= max) onCommit(n)
        }}
        onBlur={() => setDraft(null)}
        aria-invalid={draft !== null && draft.length >= 4 && !isYearIn(draft, bounds)}
        className="h-8 num"
      />
    </div>
  )
}

function isYearIn(text: string, [min, max]: readonly [number, number]): boolean {
  const n = Number(text)
  return /^\d{4}$/.test(text) && n >= min && n <= max
}

/** Articles per year as bars, the chosen years in ink, the others faint. Decorative: the fields say the range. */
function Histogram({
  bounds,
  counts,
  from,
  to,
}: {
  bounds: readonly [number, number]
  counts: ReadonlyMap<number, number>
  from: number
  to: number
}) {
  const [min, max] = bounds
  const years = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const peak = Math.max(1, ...counts.values())
  return (
    <div aria-hidden className="-mb-1.5 flex h-10 items-end gap-px border-b border-border px-1.5">
      {years.map((year) => {
        const n = counts.get(year) ?? 0
        return (
          <div
            key={year}
            title={`${year}: ${n}`}
            className={cn(
              "flex-1 transition-colors duration-150",
              year >= from && year <= to ? "bg-foreground/80" : "bg-muted-foreground/25"
            )}
            style={{ height: n ? `${Math.max(8, (n / peak) * 100)}%` : "2px" }}
          />
        )
      })}
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
