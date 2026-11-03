import { addMonths, maxMonth, monthDiff, monthOf } from './month'
import type { Cents, FlowLine, MonthKey, MonthRow, Plan, PlannedExpense } from './types'

/**
 * Découpe un montant en N mensualités entières (centimes).
 * Le reste de la division est ajouté à la première mensualité,
 * pour que la somme retombe exactement sur le total.
 */
export function splitInstallments(total: Cents, n: number): Cents[] {
  const count = Math.max(1, Math.floor(n))
  const base = Math.floor(total / count)
  const rest = total - base * count
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base))
}

/** Montants de chaque échéance d'une grosse dépense (personnalisés ou découpage égal). */
export function installmentAmounts(e: PlannedExpense): Cents[] {
  if (e.customAmounts && e.customAmounts.length > 0) return e.customAmounts
  return splitInstallments(e.totalAmount, e.installments)
}

function isActive(month: MonthKey, start: MonthKey | null, end: MonthKey | null): boolean {
  return (start === null || month >= start) && (end === null || month <= end)
}

/** Premier mois de la projection = mois de la date du capital de départ. */
export function startMonthOf(plan: Plan): MonthKey {
  return monthOf(plan.startingCapital.date)
}

/**
 * Dernier mois projeté : l'horizon (12/24 mois) est compté à partir du plus tard
 * entre le mois de départ et le mois actuel, pour qu'un capital saisi il y a
 * quelque temps donne toujours une vue complète vers l'avenir.
 */
export function endMonthOf(plan: Plan, currentMonth: MonthKey): MonthKey {
  return addMonths(maxMonth(startMonthOf(plan), currentMonth), plan.horizonMonths - 1)
}

/**
 * Calcule la projection mois par mois.
 * @param extra grosses dépenses supplémentaires (simulateur "Et si…")
 * @param currentMonth mois actuel (injectable pour les tests)
 */
export function project(
  plan: Plan,
  extra: PlannedExpense[] = [],
  currentMonth: MonthKey = monthOf(new Date()),
): MonthRow[] {
  const start = startMonthOf(plan)
  const end = endMonthOf(plan, currentMonth)
  const count = monthDiff(start, end) + 1

  // Index des lignes par mois
  const lines = new Map<MonthKey, FlowLine[]>()
  const markers = new Map<MonthKey, string[]>()
  const push = (m: MonthKey, l: FlowLine) => {
    if (m < start || m > end) return
    const arr = lines.get(m)
    if (arr) arr.push(l)
    else lines.set(m, [l])
  }
  const settled = (m: MonthKey, flag?: boolean) => m === start && !!flag

  for (let i = 0; i < count; i++) {
    const m = addMonths(start, i)
    for (const p of plan.incomePeriods) {
      if (isActive(m, p.startMonth, p.endMonth)) {
        push(m, {
          sourceId: p.id,
          kind: 'income',
          label: p.label,
          amount: p.monthlyAmount,
          settled: settled(m, p.settledInStartMonth),
        })
      }
    }
    for (const f of plan.fixedExpenses) {
      if (isActive(m, f.startMonth, f.endMonth)) {
        push(m, {
          sourceId: f.id,
          kind: 'fixedExpense',
          label: f.label,
          amount: -f.monthlyAmount,
          settled: settled(m, f.settledInStartMonth),
        })
      }
    }
  }

  for (const o of plan.oneOffIncomes) {
    push(o.month, {
      sourceId: o.id,
      kind: 'oneOffIncome',
      label: o.label,
      amount: o.amount,
      settled: settled(o.month, o.settledInStartMonth),
    })
  }

  for (const e of [...plan.plannedExpenses, ...extra]) {
    const parts = installmentAmounts(e)
    parts.forEach((amount, i) => {
      const m = addMonths(e.month, i)
      const label = parts.length > 1 ? `${e.label} (${i + 1}/${parts.length})` : e.label
      push(m, {
        sourceId: e.id,
        kind: 'plannedExpense',
        label,
        amount: -amount,
        settled: settled(m, e.settledInStartMonth),
      })
      if (m >= start && m <= end) {
        const arr = markers.get(m)
        if (arr) arr.push(label)
        else markers.set(m, [label])
      }
    })
  }

  const rows: MonthRow[] = []
  let balance = plan.startingCapital.amount
  for (let i = 0; i < count; i++) {
    const m = addMonths(start, i)
    const details = lines.get(m) ?? []
    let incomes = 0
    let outflows = 0
    for (const l of details) {
      if (l.settled) continue
      if (l.amount >= 0) incomes += l.amount
      else outflows += -l.amount
    }
    const opening = balance
    balance = opening + incomes - outflows
    rows.push({
      month: m,
      opening,
      incomes,
      outflows,
      net: incomes - outflows,
      closing: balance,
      details,
      plannedMarkers: markers.get(m) ?? [],
    })
  }
  return rows
}
