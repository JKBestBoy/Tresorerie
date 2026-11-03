import { describe, expect, it } from 'vitest'
import { emptyPlan, touchesStartMonth } from './defaults'

const plan = { ...emptyPlan(), startingCapital: { amount: 0, date: '2026-11-03' } }

describe('case « déjà passé » visible seulement si le flux tombe dans le mois de départ', () => {
  it('revenus / dépenses fixes', () => {
    const base = { id: 'x', label: '', monthlyAmount: 1 }
    expect(touchesStartMonth(plan, { ...base, startMonth: null, endMonth: null })).toBe(true)
    expect(touchesStartMonth(plan, { ...base, startMonth: '2026-12', endMonth: null })).toBe(false)
    expect(touchesStartMonth(plan, { ...base, startMonth: null, endMonth: '2026-10' })).toBe(false)
  })
  it('ponctuels', () => {
    expect(touchesStartMonth(plan, { id: 'x', label: '', amount: 1, month: '2026-11' })).toBe(true)
    expect(touchesStartMonth(plan, { id: 'x', label: '', amount: 1, month: '2026-12' })).toBe(false)
  })
  it('grosses dépenses en mensualités', () => {
    const e = { id: 'x', label: '', totalAmount: 300, installments: 3 }
    expect(touchesStartMonth(plan, { ...e, month: '2026-09' })).toBe(true) // sept, oct, nov
    expect(touchesStartMonth(plan, { ...e, month: '2026-08' })).toBe(false) // août → oct
    expect(touchesStartMonth(plan, { ...e, month: '2026-08', intervalMonths: 3 })).toBe(true) // août, nov, févr
    expect(touchesStartMonth(plan, { ...e, month: '2026-09', intervalMonths: 3 })).toBe(false) // sept, déc, mars
  })
})
