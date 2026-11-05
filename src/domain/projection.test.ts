import { describe, expect, it } from 'vitest'
import { addMonths, monthDiff } from './month'
import { parseEuros } from './money'
import { project, splitInstallments } from './projection'
import { cushionReport, freeToSpend, whatIf } from './analysis'
import type { Plan } from './types'

const NOW = '2026-11'

function plan(over: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 1,
    startingCapital: { amount: 100000, date: '2026-11-03' }, // 1 000 €
    safetyCushion: 50000, // 500 €
    horizonMonths: 12,
    incomePeriods: [],
    oneOffIncomes: [],
    fixedExpenses: [],
    plannedExpenses: [],
    ...over,
  }
}

describe('mois', () => {
  it('ajoute des mois en changeant d’année', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
    expect(monthDiff('2026-11', '2027-02')).toBe(3)
  })
})

describe('saisie de montants', () => {
  it('accepte les formats français', () => {
    expect(parseEuros('1 200,50')).toBe(120050)
    expect(parseEuros('1200.5 €')).toBe(120050)
    expect(parseEuros('abc')).toBeNull()
  })
})

describe('mensualités', () => {
  it('le reste va sur la première mensualité et le total est exact', () => {
    expect(splitInstallments(100000, 3)).toEqual([33334, 33333, 33333])
    expect(splitInstallments(100000, 1)).toEqual([100000])
  })
})

describe('projection', () => {
  it('produit 12 mois à partir du mois de départ', () => {
    const rows = project(plan(), [], NOW)
    expect(rows).toHaveLength(12)
    expect(rows[0].month).toBe('2026-11')
    expect(rows[11].month).toBe('2027-10')
  })

  it('l’horizon part du mois actuel si le capital date du passé', () => {
    const rows = project(plan({ startingCapital: { amount: 0, date: '2026-09-01' } }), [], NOW)
    expect(rows[0].month).toBe('2026-09')
    expect(rows.at(-1)!.month).toBe('2027-10')
  })

  it('enchaîne les soldes : fin = début + entrées - sorties', () => {
    const rows = project(
      plan({
        incomePeriods: [
          { id: 'a', label: 'Salaire', monthlyAmount: 120000, startMonth: null, endMonth: '2027-01' },
          { id: 'b', label: 'Salaire+', monthlyAmount: 180000, startMonth: '2027-02', endMonth: null },
        ],
        fixedExpenses: [{ id: 'f', label: 'Loyer', monthlyAmount: 80000, startMonth: null, endMonth: null }],
      }),
      [],
      NOW,
    )
    expect(rows[0]).toMatchObject({ opening: 100000, incomes: 120000, outflows: 80000, closing: 140000 })
    expect(rows[3]).toMatchObject({ month: '2027-02', incomes: 180000 })
    rows.slice(1).forEach((r, i) => expect(r.opening).toBe(rows[i].closing))
  })

  it('respecte début/fin optionnels des dépenses fixes', () => {
    const rows = project(
      plan({ fixedExpenses: [{ id: 'f', label: 'Abo', monthlyAmount: 1000, startMonth: '2026-12', endMonth: '2027-01' }] }),
      [],
      NOW,
    )
    expect(rows.map((r) => r.outflows).slice(0, 4)).toEqual([0, 1000, 1000, 0])
  })

  it('les flux "déjà passés" du mois de départ ne sont pas recomptés, mais le sont les mois suivants', () => {
    const rows = project(
      plan({
        incomePeriods: [{ id: 'a', label: 'Salaire', monthlyAmount: 120000, startMonth: null, endMonth: null, settledInStartMonth: true }],
        fixedExpenses: [{ id: 'f', label: 'Loyer', monthlyAmount: 80000, startMonth: null, endMonth: null }],
      }),
      [],
      NOW,
    )
    // Salaire déjà reçu, loyer pas encore prélevé
    expect(rows[0]).toMatchObject({ incomes: 0, outflows: 80000, closing: 20000 })
    expect(rows[0].details.find((d) => d.sourceId === 'a')?.settled).toBe(true)
    expect(rows[1]).toMatchObject({ incomes: 120000, outflows: 80000 })
  })

  it('étale une grosse dépense en mensualités et pose les marqueurs', () => {
    const rows = project(
      plan({ plannedExpenses: [{ id: 'p', label: 'PC', totalAmount: 100000, month: '2026-12', installments: 3 }] }),
      [],
      NOW,
    )
    expect(rows.slice(0, 5).map((r) => r.outflows)).toEqual([0, 33334, 33333, 33333, 0])
    expect(rows[1].plannedMarkers).toEqual(['PC (1/3)'])
  })

  it('accepte des mensualités de montants différents', () => {
    const rows = project(
      plan({
        plannedExpenses: [
          { id: 'p', label: 'Voiture', totalAmount: 0, month: '2026-12', installments: 3, customAmounts: [50000, 20000, 10000] },
        ],
      }),
      [],
      NOW,
    )
    expect(rows.slice(0, 5).map((r) => r.outflows)).toEqual([0, 50000, 20000, 10000, 0])
    expect(rows[2].plannedMarkers).toEqual(['Voiture (2/3)'])
  })

  it('paiement trimestriel : une échéance tous les 3 mois', () => {
    const rows = project(
      plan({ plannedExpenses: [{ id: 'p', label: 'Impôts', totalAmount: 90000, month: '2026-12', installments: 3, intervalMonths: 3 }] }),
      [],
      NOW,
    )
    expect(rows.slice(0, 9).map((r) => r.outflows)).toEqual([0, 30000, 0, 0, 30000, 0, 0, 30000, 0])
    expect(rows[4].plannedMarkers).toEqual(['Impôts (2/3)'])
  })

  it('dates libres : chaque échéance à son mois', () => {
    const rows = project(
      plan({
        plannedExpenses: [
          {
            id: 'p', label: 'Dentiste', totalAmount: 0, month: '2026-12', installments: 3,
            customAmounts: [30000, 20000, 10000], customMonths: ['2026-12', '2027-02', '2027-07'],
          },
        ],
      }),
      [],
      NOW,
    )
    const out = Object.fromEntries(rows.filter((r) => r.outflows).map((r) => [r.month, r.outflows]))
    expect(out).toEqual({ '2026-12': 30000, '2027-02': 20000, '2027-07': 10000 })
    expect(rows.find((r) => r.month === '2027-07')!.plannedMarkers).toEqual(['Dentiste (3/3)'])
  })

  it('calcule le reste du mois (entrées - sorties)', () => {
    const rows = project(
      plan({
        incomePeriods: [{ id: 'a', label: 'Salaire', monthlyAmount: 150000, startMonth: null, endMonth: null }],
        fixedExpenses: [{ id: 'f', label: 'Loyer', monthlyAmount: 80000, startMonth: null, endMonth: null }],
        plannedExpenses: [{ id: 'p', label: 'PC', totalAmount: 100000, month: '2026-12', installments: 1 }],
      }),
      [],
      NOW,
    )
    expect(rows[0].net).toBe(70000)
    expect(rows[1].net).toBe(-30000)
  })

  it('une dépense commencée avant le départ ne compte que ses mensualités restantes', () => {
    const rows = project(
      plan({ plannedExpenses: [{ id: 'p', label: 'Canapé', totalAmount: 30000, month: '2026-09', installments: 4 }] }),
      [],
      NOW,
    )
    // sept. et oct. sont avant le départ : restent nov. (3/4) et déc. (4/4)
    expect(rows.slice(0, 3).map((r) => r.outflows)).toEqual([7500, 7500, 0])
  })
})

describe('matelas et dépenses libres', () => {
  const p = plan({
    incomePeriods: [{ id: 'a', label: 'Salaire', monthlyAmount: 100000, startMonth: null, endMonth: null }],
    fixedExpenses: [{ id: 'f', label: 'Loyer', monthlyAmount: 100000, startMonth: null, endMonth: null }],
    plannedExpenses: [{ id: 'p', label: 'Voiture', totalAmount: 70000, month: '2027-03', installments: 1 }],
  })
  const rows = project(p, [], NOW)

  it('détecte le premier passage sous le matelas et le manque', () => {
    // 1000 € stables puis -700 € en mars => 300 €, sous le matelas de 500 €
    const r = cushionReport(rows, p.safetyCushion)
    expect(r.firstBreach).toEqual({ month: '2027-03', shortfall: 20000 })
  })

  it('montant libre = 0 et indique le manque déjà existant', () => {
    expect(freeToSpend(rows, p.safetyCushion, NOW)).toEqual({ amount: 0, alreadyShort: 20000 })
  })

  it('montant libre = min(soldes futurs) - matelas', () => {
    const rows2 = project({ ...p, plannedExpenses: [] }, [], NOW)
    expect(freeToSpend(rows2, p.safetyCushion, NOW).amount).toBe(50000)
  })
})

describe('simulateur "Et si…"', () => {
  const p = plan({
    incomePeriods: [{ id: 'a', label: 'Salaire', monthlyAmount: 100000, startMonth: null, endMonth: null }],
    fixedExpenses: [{ id: 'f', label: 'Loyer', monthlyAmount: 90000, startMonth: null, endMonth: null }],
  })
  // Le solde gagne 100 €/mois : 1100, 1200, 1300…

  it('ça passe', () => {
    const r = whatIf(p, { amount: 60000, month: '2027-01', installments: 1 }, NOW)
    // janv. : 1300 - 600 = 700 => marge 200
    expect(r.verdict).toEqual({ ok: true, remainingMargin: 20000 })
    expect(r.maxSpendInMonth).toBe(80000)
  })

  it('il manquera X € en [mois]', () => {
    const r = whatIf(p, { amount: 100000, month: '2027-01', installments: 1 }, NOW)
    expect(r.verdict).toMatchObject({
      ok: false,
      firstBreach: { month: '2027-01', shortfall: 20000 },
      baseAlreadyShort: false,
    })
  })

  it('en mensualités, ça peut passer', () => {
    const r = whatIf(p, { amount: 100000, month: '2027-01', installments: 4 }, NOW)
    expect(r.verdict.ok).toBe(true)
  })
})
