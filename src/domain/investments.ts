import type { Cents, Investment, Plan } from './types'

/** Cours en direct, en euros par unité, indexés par clé de cours. */
export interface LiveQuote {
  eur: number
  changePct: number | null
  at: string
}
export type Quotes = Record<string, LiveQuote>

export function quoteKey(inv: Investment): string | null {
  if (inv.kind === 'fixed' || !inv.symbol) return null
  return `${inv.kind === 'crypto' ? 'coingecko' : 'yahoo'}:${inv.symbol}`
}

export interface InvestmentValue {
  value: Cents
  /** Prix unitaire utilisé (euros) */
  unitPrice: number
  /** Variation du jour en % (null si inconnue) */
  changePct: number | null
  /** Variation du jour en centimes, sur la quantité détenue */
  change: Cents
  /** live = cours en direct ; manual = prix saisi (valeur fixe ou cours indisponible) */
  source: 'live' | 'manual'
}

export function valueOf(inv: Investment, quotes: Quotes): InvestmentValue {
  const key = quoteKey(inv)
  const q = key ? quotes[key] : undefined
  if (q) {
    const value = Math.round(inv.quantity * q.eur * 100)
    const change = q.changePct === null ? 0 : Math.round(value - value / (1 + q.changePct / 100))
    return { value, unitPrice: q.eur, changePct: q.changePct, change, source: 'live' }
  }
  return {
    value: Math.round(inv.quantity * inv.manualUnitPrice),
    unitPrice: inv.manualUnitPrice / 100,
    changePct: null,
    change: 0,
    source: 'manual',
  }
}

export function investmentsSummary(plan: Plan, quotes: Quotes) {
  const lines = (plan.investments ?? []).map((inv) => ({ inv, ...valueOf(inv, quotes) }))
  const total = lines.reduce((s, l) => s + l.value, 0)
  const change = lines.reduce((s, l) => s + l.change, 0)
  return {
    lines,
    total,
    /** Variation du jour, en centimes */
    change,
  }
}
