import type { ReactNode } from 'react'
import { ChevronDown, Plus, Trash2, type LucideIcon } from 'lucide-react'

export const TONES = {
  indigo: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-300',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-300',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-300',
} as const

export function Section({
  title,
  subtitle,
  total,
  icon: Icon,
  tone,
  children,
  defaultOpen = true,
}: {
  title: string
  subtitle?: string
  total?: string
  icon: LucideIcon
  tone: keyof typeof TONES
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group rounded-3xl bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(30_27_75/0.12)] ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${TONES[tone]}`}>
          <Icon size={22} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-snug text-muted">{subtitle}</p>}
        </div>
        {total && <span className="num shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{total}</span>}
        <ChevronDown size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  )
}

export function ItemCard({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  return (
    <div className="relative space-y-3 rounded-2xl bg-surface-2 p-3.5">
      {children}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-neg hover:bg-neg-soft"
        >
          <Trash2 size={14} /> Supprimer
        </button>
      </div>
    </div>
  )
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
    >
      <Plus size={18} /> {children}
    </button>
  )
}

