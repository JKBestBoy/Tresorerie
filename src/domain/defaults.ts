import { addMonths, monthOf } from './month'
import { installmentSchedule, startMonthOf } from './projection'
import type { FixedExpense, IncomePeriod, Investment, OneOffIncome, Plan, PlannedExpense } from './types'

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function emptyPlan(): Plan {
  return {
    schemaVersion: 1,
    startingCapital: { amount: 0, date: todayISO() },
    safetyCushion: 0,
    horizonMonths: 12,
    incomePeriods: [],
    oneOffIncomes: [],
    fixedExpenses: [],
    plannedExpenses: [],
  }
}

export const newIncomePeriod = (): IncomePeriod => ({
  id: newId(), label: '', monthlyAmount: 0, startMonth: null, endMonth: null,
})
export const newOneOffIncome = (plan: Plan): OneOffIncome => ({
  id: newId(), label: '', amount: 0, month: addMonths(monthOf(new Date()) > startMonthOf(plan) ? monthOf(new Date()) : startMonthOf(plan), 1),
})
export const newInvestment = (): Investment => ({
  id: newId(), label: '', kind: 'crypto', symbol: '', quantity: 0, manualUnitPrice: 0,
})
export const newFixedExpense = (): FixedExpense => ({
  id: newId(), label: '', monthlyAmount: 0, startMonth: null, endMonth: null,
})
export const newPlannedExpense = (plan: Plan): PlannedExpense => ({
  id: newId(), label: '', totalAmount: 0, month: newOneOffIncome(plan).month, installments: 1,
})

/** Vrai si ce flux a un montant qui tombe dans le mois de départ (pour afficher la case « déjà passé »). */
export function touchesStartMonth(
  plan: Plan,
  item: IncomePeriod | FixedExpense | OneOffIncome | PlannedExpense,
): boolean {
  const s = startMonthOf(plan)
  if ('installments' in item) {
    return installmentSchedule(item).some((x) => x.month === s)
  }
  if ('month' in item) return item.month === s
  return (item.startMonth === null || item.startMonth <= s) && (item.endMonth === null || item.endMonth >= s)
}
