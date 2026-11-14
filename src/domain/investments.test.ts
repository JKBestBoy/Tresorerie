import { describe, expect, it } from 'vitest'
import { emptyPlan } from './defaults'
import { guessInvestment, investmentsSummary, linkTxToInvestment, quoteKey, unlinkTx, valueOf } from './investments'
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

  it('total des investissements', () => {
    const plan = { ...emptyPlan(), investments: [btc, etf, cash] }
    expect(investmentsSummary(plan, quotes).total).toBe(1400000 + 210000 + 255)
  })

  it('plan sans investissements', () => {
    expect(investmentsSummary(emptyPlan(), quotes)).toMatchObject({ total: 0, change: 0 })
  })
})

describe('opérations ajoutées aux investissements', () => {
  const base = {
    schemaVersion: 1 as const,
    startingCapital: { amount: 0, date: '2026-11-01' },
    safetyCushion: 0,
    horizonMonths: 12 as const,
    incomePeriods: [],
    oneOffIncomes: [],
    fixedExpenses: [],
    plannedExpenses: [],
    investments: [
      { id: 'btc', label: 'Bitcoin', account: 'OKX', kind: 'crypto' as const, symbol: 'bitcoin', quantity: 0.1, manualUnitPrice: 0 },
      { id: 'liv', label: 'Livret A', kind: 'fixed' as const, symbol: '', quantity: 1, manualUnitPrice: 100000 },
    ],
  }
  const quotes = { 'coingecko:bitcoin': { eur: 50000, changePct: 0, at: '' } }

  it('un versement augmente la quantité, et s’annule', () => {
    const p = linkTxToInvestment(base, 't1', -50000, 'btc', quotes)
    expect(p.investments![0].quantity).toBeCloseTo(0.11)
    expect(investmentsSummary(p, quotes).total).toBe(550000 + 100000)
    // Relier de nouveau la même opération ne la compte pas deux fois
    expect(linkTxToInvestment(p, 't1', -50000, 'btc', quotes).investments![0].quantity).toBeCloseTo(0.11)
    expect(unlinkTx(p, 't1').investments![0].quantity).toBeCloseTo(0.1)
    expect(unlinkTx(p, 't1').investLinks).toEqual({})
  })

  it('valeur fixe (livret) : la valeur augmente ; retrait : elle baisse', () => {
    let p = linkTxToInvestment(base, 'a', -20000, 'liv', quotes)
    expect(p.investments![1].manualUnitPrice).toBe(120000)
    p = linkTxToInvestment(p, 'b', 5000, 'liv', quotes)
    expect(p.investments![1].manualUnitPrice).toBe(115000)
    expect(unlinkTx(p, 'a').investments![1].manualUnitPrice).toBe(95000)
  })

  it('devine l’investissement d’après le libellé', () => {
    expect(guessInvestment(base, 'OKX EUROPE Achat')?.id).toBe('btc')
    expect(guessInvestment(base, 'Virement Livret A')?.id).toBe('liv')
    expect(guessInvestment(base, 'Trade Republic')).toBeUndefined()
  })
})
