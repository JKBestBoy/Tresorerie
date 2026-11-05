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

/** Échéancier d'une grosse dépense : mois et montant de chaque paiement. */
export function installmentSchedule(e: PlannedExpense): { month: MonthKey; amount: Cents }[] {
  const step = Math.max(1, e.intervalMonths ?? 1)
  const amounts = installmentAmounts(e)
  const free = e.customMonths && e.customMonths.length === amounts.length ? e.customMonths : null
  return amounts.map((amount, i) => ({ month: free ? free[i] : addMonths(e.month, i * step), amount }))
}

function isActive(month: MonthKey, start: MonthKey | null, end: MonthKey | null): boolean {
  return (start === null || month >= start) && (end === null || month <= end)
}

/**
 * Flux du mois de départ déjà passés sur le compte (déjà inclus dans le solde saisi).
 * Si le pointage date d'un autre mois (le solde a été mis à jour depuis), rien n'est pointé.
 * Plans plus anciens : on relit les cases « déjà passé » de chaque élément.
 */
export function settledIds(plan: Plan): Set<string> {
  const start = startMonthOf(plan)
  if (plan.settled) return new Set(plan.settled.month === start ? plan.settled.ids : [])
  const legacy = [...plan.incomePeriods, ...plan.oneOffIncomes, ...plan.fixedExpenses, ...plan.plannedExpenses]
  return new Set(legacy.filter((x) => x.settledInStartMonth).map((x) => x.id))
}

/** Coche ou décoche un flux dans le pointage du mois de départ. */
export function toggleSettled(plan: Plan, id: string): Plan {
  const ids = settledIds(plan)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ...plan, settled: { month: startMonthOf(plan), ids: [...ids] } }
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
  const pointed = settledIds(plan)
  const settled = (m: MonthKey, id: string) => m === start && pointed.has(id)

  for (let i = 0; i < count; i++) {
    const m = addMonths(start, i)
    for (const p of plan.incomePeriods) {
      if (isActive(m, p.startMonth, p.endMonth)) {
        push(m, {
          sourceId: p.id,
          kind: 'income',
          label: p.label,
          amount: p.monthlyAmount,
          settled: settled(m, p.id),
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
          settled: settled(m, f.id),
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
      settled: settled(o.month, o.id),
    })
  }

  for (const e of [...plan.plannedExpenses, ...extra]) {
    const parts = installmentSchedule(e)
    parts.forEach(({ month: m, amount }, i) => {
      const label = parts.length > 1 ? `${e.label} (${i + 1}/${parts.length})` : e.label
      push(m, {
        sourceId: e.id,
        kind: 'plannedExpense',
        label,
        amount: -amount,
        settled: settled(m, e.id),
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
