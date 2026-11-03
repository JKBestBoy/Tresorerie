import { addMonths } from './month'
import type { MonthKey, Plan } from './types'

/** Plan d'exemple pour tester l'application (sera remplacé par vos données à l'étape 2). */
export function samplePlan(currentMonth: MonthKey, today: string): Plan {
  const m = (n: number) => addMonths(currentMonth, n)
  return {
    schemaVersion: 1,
    startingCapital: { amount: 300000, date: today },
    safetyCushion: 150000,
    horizonMonths: 12,
    incomePeriods: [
      { id: 'i1', label: 'Salaire', monthlyAmount: 120000, startMonth: null, endMonth: m(5), settledInStartMonth: true },
      { id: 'i2', label: 'Salaire (augmentation)', monthlyAmount: 180000, startMonth: m(6), endMonth: null },
    ],
    oneOffIncomes: [{ id: 'o1', label: 'Prime', amount: 50000, month: m(2) }],
    fixedExpenses: [
      { id: 'f1', label: 'Loyer', monthlyAmount: 75000, startMonth: null, endMonth: null },
      { id: 'f2', label: 'Courses', monthlyAmount: 30000, startMonth: null, endMonth: null },
      { id: 'f3', label: 'Abonnement salle de sport', monthlyAmount: 3500, startMonth: null, endMonth: m(4), settledInStartMonth: true },
    ],
    plannedExpenses: [
      { id: 'p1', label: 'Ordinateur', totalAmount: 120000, month: m(1), installments: 3 },
      { id: 'p2', label: 'Vacances', totalAmount: 150000, month: m(7), installments: 1 },
    ],
  }
}
