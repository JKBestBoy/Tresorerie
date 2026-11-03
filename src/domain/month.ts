import type { MonthKey } from './types'

export function monthOf(date: string | Date): MonthKey {
  if (typeof date === 'string') return date.slice(0, 7)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${m}`
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Nombre de mois de a vers b (b - a). */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

export function maxMonth(a: MonthKey, b: MonthKey): MonthKey {
  return a > b ? a : b
}

const longFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' })

function toDate(month: MonthKey): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/** "janvier 2027" */
export function monthLabel(month: MonthKey): string {
  return longFmt.format(toDate(month))
}

/** "janv. 27" */
export function monthShortLabel(month: MonthKey): string {
  return shortFmt.format(toDate(month))
}
