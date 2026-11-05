import { describe, expect, it } from 'vitest'
import { balanceChecks, itemAverages } from './history'
import { project, setActual, setOpening, toggleSettled, withNewBalance } from './projection'
import type { Plan } from './types'

function plan(): Plan {
  return {
    schemaVersion: 1,
    startingCapital: { amount: 100000, date: '2026-11-03' },
    safetyCushion: 0,
    horizonMonths: 12,
    incomePeriods: [{ id: 'sal', label: 'Salaire', monthlyAmount: 150000, startMonth: null, endMonth: null }],
    oneOffIncomes: [],
    fixedExpenses: [
      { id: 'c', label: 'Courses', monthlyAmount: 10000, startMonth: null, endMonth: null },
      { id: 'l', label: 'Loyer', monthlyAmount: 80000, startMonth: null, endMonth: null },
    ],
    plannedExpenses: [],
  }
}

describe('historique', () => {
  it('archive le mois écoulé à la mise à jour du solde', () => {
    let p = setActual(plan(), '2026-11', 'c', 8700)
    p = toggleSettled(p, '2026-11', 'l')
    p = setOpening(p, '2027-02', 123400)
    const expected = project(p, [], '2026-11')[0].closing // 100 000 + 150 000 − 8 700 (loyer déjà passé)
    const next = withNewBalance(p, 240000, '2026-12-02')
    expect(next.history).toHaveLength(1)
    const h = next.history![0]
    expect(h).toMatchObject({ month: '2026-11', opening: 100000, closing: expected, realBalance: { amount: 240000, date: '2026-12-02' } })
    expect(h.lines.find((l) => l.id === 'c')).toMatchObject({ planned: -10000, amount: -8700, paid: false })
    expect(h.lines.find((l) => l.id === 'l')).toMatchObject({ amount: -80000, paid: true })
    // Les corrections du mois archivé sont nettoyées, celles à venir sont gardées
    expect(next.actuals).toEqual({})
    expect(next.openings).toEqual({ '2027-02': 123400 })
    expect(project(next, [], '2026-12')[0]).toMatchObject({ month: '2026-12', opening: 240000 })
  })

  it('archive plusieurs mois si le solde n’a pas été mis à jour depuis longtemps', () => {
    const next = withNewBalance(plan(), 200000, '2027-02-01')
    expect(next.history!.map((h) => h.month)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(next.history![2].realBalance?.amount).toBe(200000)
    expect(next.history![0].realBalance).toBeUndefined()
  })

  it('pas d’archive si le solde est mis à jour dans le même mois', () => {
    expect(withNewBalance(plan(), 90000, '2026-11-20').history).toEqual([])
  })

  it('moyennes réelles par poste et écarts de solde', () => {
    let p = setActual(plan(), '2026-11', 'c', 8700)
    p = withNewBalance(p, 240000, '2026-12-02')
    p = setActual(p, '2026-12', 'c', 9300)
    p = withNewBalance(p, 300000, '2027-01-03')
    const avg = itemAverages(p.history!)
    expect(avg[0]).toMatchObject({ label: 'Courses', months: 2, average: 9000, planned: 10000, gap: -1000 })
    expect(avg.find((a) => a.label === 'Loyer')).toMatchObject({ gap: 0 })
    const checks = balanceChecks(p.history!)
    expect(checks.map((c) => c.month)).toEqual(['2026-12', '2026-11'])
    expect(checks[1]).toMatchObject({ expected: 100000 + 150000 - 8700 - 80000, real: 240000 })
  })
})
