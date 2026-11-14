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

/**
 * Ajoute une opération du relevé à un investissement : un versement de 500 € sur du bitcoin à 70 000 €
 * ajoute 0,00714 BTC. Valeur fixe (livret…) : la valeur augmente du montant. Retrait : l'inverse.
 * `amount` est le montant de l'opération (négatif = argent sorti du compte = placé).
 */
export function linkTxToInvestment(plan: Plan, txId: string, amount: Cents, investmentId: string, quotes: Quotes): Plan {
  const base = unlinkTx(plan, txId)
  const invs = base.investments ?? []
  const inv = invs.find((i) => i.id === investmentId)
  if (!inv) return base
  const placed = -amount // positif = versé sur l'investissement
  let next: Investment
  let quantity: number
  if (inv.kind === 'fixed') {
    // Valeur fixe : on garde la quantité, on augmente la valeur
    const qty = inv.quantity || 1
    quantity = 0
    next = { ...inv, quantity: qty, manualUnitPrice: Math.max(0, Math.round(inv.manualUnitPrice + placed / qty)) }
  } else {
    const price = valueOf(inv, quotes).unitPrice
    if (!(price > 0)) return base
    quantity = placed / 100 / price
    next = { ...inv, quantity: Math.max(0, inv.quantity + quantity) }
  }
  return {
    ...base,
    investments: invs.map((i) => (i.id === inv.id ? next : i)),
    investLinks: { ...base.investLinks, [txId]: { investmentId, quantity: inv.kind === 'fixed' ? placed : quantity } },
  }
}

/** Annule l'ajout d'une opération à un investissement (quantité, ou valeur pour une valeur fixe). */
export function unlinkTx(plan: Plan, txId: string): Plan {
  const link = plan.investLinks?.[txId]
  if (!link) return plan
  const rest = { ...plan.investLinks }
  delete rest[txId]
  const investments = (plan.investments ?? []).map((i) => {
    if (i.id !== link.investmentId) return i
    if (i.kind === 'fixed') return { ...i, manualUnitPrice: Math.max(0, Math.round(i.manualUnitPrice - link.quantity / (i.quantity || 1))) }
    return { ...i, quantity: Math.max(0, i.quantity - link.quantity) }
  })
  return { ...plan, investments, investLinks: rest }
}

/** Investissement probable pour une opération : celui dont le compte ou le nom apparaît dans le libellé. */
export function guessInvestment(plan: Plan, text: string): Investment | undefined {
  const norm = (s: string) => ` ${s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  const t = norm(text)
  const hit = (s?: string) => !!s && norm(s).trim().length >= 3 && t.includes(norm(s))
  const invs = plan.investments ?? []
  return invs.find((i) => hit(i.label)) ?? (invs.filter((i) => hit(i.account)).length === 1 ? invs.find((i) => hit(i.account)) : undefined)
}
