import type { Cents, HistoryMonth } from './types'

export interface ItemAverage {
  id: string
  label: string
  kind: string
  months: number
  /** Montant moyen retenu (positif) */
  average: Cents
  /** Montant prévu le plus récent (positif) */
  planned: Cents
  /** Écart moyen par mois : positif = plus que prévu */
  gap: Cents
}

/** Moyenne réelle de chaque revenu / dépense récurrente sur les mois archivés. */
export function itemAverages(history: HistoryMonth[]): ItemAverage[] {
  const by = new Map<string, { label: string; kind: string; amounts: Cents[]; planned: Cents }>()
  for (const h of history) {
    for (const l of h.lines) {
      if (l.kind !== 'fixedExpense' && l.kind !== 'income') continue
      const e = by.get(l.id) ?? { label: l.label, kind: l.kind, amounts: [], planned: 0 }
      e.label = l.label
      e.amounts.push(Math.abs(l.amount))
      e.planned = Math.abs(l.planned)
      by.set(l.id, e)
    }
  }
  return [...by.entries()]
    .map(([id, e]) => {
      const average = Math.round(e.amounts.reduce((s, x) => s + x, 0) / e.amounts.length)
      return { id, label: e.label, kind: e.kind, months: e.amounts.length, average, planned: e.planned, gap: average - e.planned }
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.label.localeCompare(b.label))
}

export interface BalanceCheck {
  month: string
  date: string
  /** Solde prévu en fin de mois par l'app */
  expected: Cents
  /** Solde réel saisi ensuite */
  real: Cents
  /** real − expected */
  gap: Cents
}

/** Comparaison entre le solde prévu et le solde réel saisi à chaque mise à jour. */
export function balanceChecks(history: HistoryMonth[]): BalanceCheck[] {
  return history
    .filter((h) => h.realBalance)
    .map((h) => ({
      month: h.month,
      date: h.realBalance!.date,
      expected: h.closing,
      real: h.realBalance!.amount,
      gap: h.realBalance!.amount - h.closing,
    }))
    .reverse()
}
