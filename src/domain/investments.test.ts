import { describe, expect, it } from 'vitest'
import { emptyPlan } from './defaults'
import { investmentsSummary, quoteKey, valueOf } from './investments'
import type { Investment } from './types'

const btc: Investment = { id: 'b', label: 'Bitcoin', kind: 'crypto', symbol: 'bitcoin', quantity: 0.2, manualUnitPrice: 6000000 }
const etf: Investment = { id: 'e', label: 'ETF', kind: 'security', symbol: 'ESE.PA', quantity: 60, manualUnitPrice: 3400 }
const cash: Investment = { id: 'c', label: 'Espèces PEA', kind: 'fixed', symbol: '', quantity: 1, manualUnitPrice: 255 }
const quotes = {
  'coingecko:bitcoin': { eur: 70000, changePct: 2, at: '' },
  'yahoo:ESE.PA': { eur: 35, changePct: null, at: '' },
}

describe('investissements', () => {
  it('clé de cours selon le type', () => {
    expect(quoteKey(btc)).toBe('coingecko:bitcoin')
    expect(quoteKey(etf)).toBe('yahoo:ESE.PA')
    expect(quoteKey(cash)).toBeNull()
  })

  it('valeur = quantité × cours en direct', () => {
    const v = valueOf(btc, quotes)
    expect(v).toMatchObject({ value: 1400000, source: 'live', changePct: 2 })
    // +2 % sur la journée : 14 000 € aujourd'hui contre 13 725,49 € hier
    expect(v.change).toBe(27451)
  })

  it('utilise le prix de secours sans cours en direct', () => {
    expect(valueOf(btc, {})).toMatchObject({ value: 1200000, source: 'manual' })
    expect(valueOf(cash, quotes)).toMatchObject({ value: 255, source: 'manual' })
  })

  it('total et part comptée dans la sécurité', () => {
    const plan = { ...emptyPlan(), investments: [btc, etf, cash], investmentsCountedPct: 50 }
    const s = investmentsSummary(plan, quotes)
    expect(s.total).toBe(1400000 + 210000 + 255)
    expect(s.counted).toBe(Math.round(s.total / 2))
    expect(investmentsSummary({ ...plan, investmentsCountedPct: undefined }, quotes).counted).toBe(s.total)
  })

  it('plan sans investissements', () => {
    expect(investmentsSummary(emptyPlan(), quotes)).toMatchObject({ total: 0, counted: 0 })
  })
})
