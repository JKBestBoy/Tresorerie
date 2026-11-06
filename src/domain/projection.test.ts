import { describe, expect, it } from 'vitest'
import { addMonths, monthDiff } from './month'
import { parseEuros } from './money'
import { installmentSchedule, paidKeys, project, setActual, setOpening, splitInstallments, toggleSettled, withNewBalance } from './projection'
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

  it('horizon « auto » : jusqu’à la dernière grosse dépense prévue', () => {
    const p = plan({
      horizonMonths: 'auto',
      plannedExpenses: [
        { id: 'a', label: 'PC', totalAmount: 1000, month: '2027-02', installments: 1 },
        { id: 'b', label: 'Dentiste', totalAmount: 4000, month: '2026-12', installments: 4, intervalMonths: 3 },
      ],
    })
    const rows = project(p, [], NOW)
    expect(rows[0].month).toBe('2026-11')
    expect(rows.at(-1)!.month).toBe('2027-09') // dernière échéance du dentiste
    // Sans grosse dépense : 12 mois
    expect(project(plan({ horizonMonths: 'auto' }), [], NOW)).toHaveLength(12)
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

  it('pointage : les flux cochés ne sont pas recomptés, quel que soit le mois', () => {
    const p = plan({
      incomePeriods: [{ id: 'a', label: 'Salaire', monthlyAmount: 120000, startMonth: null, endMonth: null }],
      fixedExpenses: [
        { id: 'f', label: 'Loyer', monthlyAmount: 80000, startMonth: null, endMonth: null, settledInStartMonth: true },
        { id: 'i', label: 'Internet', monthlyAmount: 3000, startMonth: null, endMonth: null },
      ],
    })
    // Anciennes cases : le loyer de novembre est pointé
    expect(project(p, [], NOW)[0]).toMatchObject({ incomes: 120000, outflows: 3000 })
    // On coche Internet de novembre et le loyer de décembre (payé en avance)
    const p2 = toggleSettled(toggleSettled(p, '2026-11', 'i'), '2026-12', 'f')
    expect([...paidKeys(p2)]).toEqual(['2026-11|f', '2026-11|i', '2026-12|f'])
    const rows = project(p2, [], NOW)
    expect(rows[0].outflows).toBe(0)
    expect(rows[1].outflows).toBe(3000)
    expect(rows[2].outflows).toBe(83000)
    // Décocher
    expect(project(toggleSettled(p2, '2026-12', 'f'), [], NOW)[1].outflows).toBe(83000)
  })

  it('montant réel d’un mois : remplace le prévu ce mois-là seulement', () => {
    const p = plan({ fixedExpenses: [{ id: 'c', label: 'Courses', monthlyAmount: 10000, startMonth: null, endMonth: null }] })
    const p2 = setActual(p, '2026-12', 'c', 8700)
    const rows = project(p2, [], NOW)
    expect(rows.slice(0, 3).map((r) => r.outflows)).toEqual([10000, 8700, 10000])
    expect(rows[1].details[0]).toMatchObject({ amount: -8700, planned: -10000 })
    // Remettre le prévu
    expect(project(setActual(p2, '2026-12', 'c', null), [], NOW)[1].outflows).toBe(10000)
  })

  it('solde de début modifiable : la projection repart du solde saisi', () => {
    const p = plan({ fixedExpenses: [{ id: 'c', label: 'Courses', monthlyAmount: 10000, startMonth: null, endMonth: null }] })
    // Départ 1 000 € ; on constate 950 € au début de janvier (prévu : 800 €)
    const p2 = setOpening(p, '2027-01', 95000)
    const rows = project(p2, [], NOW)
    expect(rows[2]).toMatchObject({ month: '2027-01', opening: 95000, plannedOpening: 80000, closing: 85000 })
    expect(rows[3].opening).toBe(85000)
    expect(rows[1].plannedOpening).toBeUndefined()
    // Revenir au calcul
    expect(project(setOpening(p2, '2027-01', null), [], NOW)[2].opening).toBe(80000)
    // Mois de départ = solde de départ
    expect(setOpening(p, '2026-11', 50000).startingCapital.amount).toBe(50000)
  })

  it('nouveau solde : ce qui était coché à l’avance reste coché, les mois passés disparaissent', () => {
    const p = plan({
      fixedExpenses: [
        { id: 'i', label: 'Internet', monthlyAmount: 3000, startMonth: null, endMonth: null },
        { id: 'l', label: 'Loyer', monthlyAmount: 80000, startMonth: null, endMonth: null },
      ],
    })
    // En novembre : Internet de novembre passé, loyer de décembre payé en avance
    const ticked = toggleSettled(toggleSettled(p, '2026-11', 'i'), '2026-12', 'l')
    const next = withNewBalance(ticked, 50000, '2026-12-02')
    expect([...paidKeys(next)]).toEqual(['2026-12|l'])
    const rows = project(next, [], '2026-12')
    // Le loyer de décembre est déjà dans le nouveau solde : seul Internet reste à payer
    expect(rows[0]).toMatchObject({ month: '2026-12', opening: 50000, outflows: 3000 })
    expect(rows[1].outflows).toBe(83000)
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

  it('dates libres saisies dans le désordre : échéances remises dans l’ordre des dates', () => {
    const e = {
      id: 'd', label: 'Dentiste', totalAmount: 0, month: '2026-12', installments: 3,
      customAmounts: [50000, 30000, 2000], customMonths: ['2026-12', '2027-03', '2026-11'],
    }
    expect(installmentSchedule(e).map((x) => [x.month, x.amount])).toEqual([
      ['2026-11', 2000],
      ['2026-12', 50000],
      ['2027-03', 30000],
    ])
    const rows = project(plan({ plannedExpenses: [e] }), [], NOW)
    expect(rows[0].plannedMarkers).toEqual(['Dentiste (1/3)'])
    expect(rows[0].outflows).toBe(2000)
    expect(rows[4].plannedMarkers).toEqual(['Dentiste (3/3)'])
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
