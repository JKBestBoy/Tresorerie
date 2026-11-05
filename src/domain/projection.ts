import { addMonths, maxMonth, monthDiff, monthOf } from './month'
import type { Cents, FlowLine, HistoryMonth, MonthKey, MonthRow, Plan, PlannedExpense } from './types'

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

export const paidKey = (month: MonthKey, id: string) => `${month}|${id}`

/**
 * Pointage : clés « mois|id » des flux déjà passés sur le compte (inclus dans le solde saisi).
 * Les mois antérieurs au mois de départ sont ignorés (déjà couverts par le solde).
 * Plans plus anciens : pointage du seul mois de départ (`settled`), ou anciennes cases.
 */
export function paidKeys(plan: Plan): Set<string> {
  const start = startMonthOf(plan)
  if (plan.paid) return new Set(plan.paid.filter((k) => k.slice(0, 7) >= start))
  if (plan.settled) return new Set(plan.settled.month === start ? plan.settled.ids.map((id) => paidKey(start, id)) : [])
  const legacy = [...plan.incomePeriods, ...plan.oneOffIncomes, ...plan.fixedExpenses, ...plan.plannedExpenses]
  return new Set(legacy.filter((x) => x.settledInStartMonth).map((x) => paidKey(start, x.id)))
}

/** Coche ou décoche un flux d'un mois donné. */
export function toggleSettled(plan: Plan, month: MonthKey, id: string): Plan {
  const keys = paidKeys(plan)
  const k = paidKey(month, id)
  if (keys.has(k)) keys.delete(k)
  else keys.add(k)
  return { ...plan, paid: [...keys].sort(), settled: undefined }
}

/**
 * Nouveau solde saisi aujourd'hui. Tout ce qui est déjà coché était déjà passé sur le compte,
 * donc est inclus dans ce nouveau solde : on garde ces coches (mois du solde et suivants).
 */
export function withNewBalance(plan: Plan, amount: number, date: string): Plan {
  const keys = paidKeys(plan)
  const month = date.slice(0, 7)
  // Archive les mois écoulés (du mois de départ jusqu'au mois précédent le nouveau solde)
  const past = month > startMonthOf(plan) ? project(plan, [], month).filter((r) => r.month < month) : []
  const archived: HistoryMonth[] = past.map((r, i) => ({
    month: r.month,
    opening: r.opening,
    incomes: r.incomes,
    outflows: r.outflows,
    closing: r.closing,
    lines: r.details.map((d) => ({
      id: d.sourceId,
      kind: d.kind,
      label: d.label,
      planned: d.planned ?? d.amount,
      amount: d.amount,
      paid: d.settled,
    })),
    ...(i === past.length - 1 ? { realBalance: { amount, date } } : {}),
    archivedAt: new Date().toISOString(),
  }))
  const history = [...(plan.history ?? []).filter((h) => !archived.some((a) => a.month === h.month)), ...archived].sort((a, b) =>
    a.month.localeCompare(b.month),
  )
  const keep = <T,>(rec: Record<string, T> | undefined, keyMonth: (k: string) => string) =>
    rec ? Object.fromEntries(Object.entries(rec).filter(([k]) => keyMonth(k) >= month)) : undefined
  return {
    ...plan,
    startingCapital: { amount, date },
    paid: [...keys].filter((k) => k.slice(0, 7) >= month).sort(),
    settled: undefined,
    // Les montants réels et soldes saisis des mois écoulés sont désormais dans l'historique
    actuals: keep(plan.actuals, (k) => k.slice(0, 7)),
    openings: keep(plan.openings, (k) => k),
    history,
  }
}

/** Corrige (ou remet au prévu avec `null`) le montant réel d'un flux pour un mois. */
export function setActual(plan: Plan, month: MonthKey, id: string, amount: Cents | null): Plan {
  const actuals = { ...(plan.actuals ?? {}) }
  const k = paidKey(month, id)
  if (amount === null) delete actuals[k]
  else actuals[k] = Math.max(0, Math.round(amount))
  return { ...plan, actuals }
}

/** Solde de fin du dernier mois calculé (= solde de début prévu du mois suivant). */
function row0Balance(rows: MonthRow[]): Cents {
  return rows[rows.length - 1].closing
}

/**
 * Modifie le solde de début d'un mois. Pour le mois de départ, c'est le solde de départ ;
 * pour les autres, un solde constaté (`null` = revenir au solde calculé).
 */
export function setOpening(plan: Plan, month: MonthKey, amount: Cents | null): Plan {
  if (month === startMonthOf(plan)) {
    return amount === null ? plan : { ...plan, startingCapital: { ...plan.startingCapital, amount } }
  }
  const openings = { ...(plan.openings ?? {}) }
  if (amount === null) delete openings[month]
  else openings[month] = Math.round(amount)
  return { ...plan, openings }
}

/** Premier mois de la projection = mois de la date du capital de départ. */
export function startMonthOf(plan: Plan): MonthKey {
  return monthOf(plan.startingCapital.date)
}

/** Mois de la dernière échéance de grosse dépense prévue (null s'il n'y en a pas). */
export function lastPlannedMonth(plan: Plan): MonthKey | null {
  let last: MonthKey | null = null
  for (const e of plan.plannedExpenses) {
    for (const { month } of installmentSchedule(e)) if (!last || month > last) last = month
  }
  return last
}

/**
 * Dernier mois projeté, compté à partir du plus tard entre le mois de départ et le mois
 * actuel (un solde saisi il y a quelque temps donne toujours une vue vers l'avenir) :
 * - 12 ou 24 mois ;
 * - 'auto' : jusqu'à la dernière grosse dépense prévue (12 mois s'il n'y en a pas à venir).
 */
export function endMonthOf(plan: Plan, currentMonth: MonthKey): MonthKey {
  const base = maxMonth(startMonthOf(plan), currentMonth)
  if (plan.horizonMonths === 'auto') {
    const last = lastPlannedMonth(plan)
    return last && last >= base ? last : addMonths(base, 11)
  }
  return addMonths(base, plan.horizonMonths - 1)
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
  const actuals = plan.actuals ?? {}
  const push = (m: MonthKey, l: FlowLine) => {
    if (m < start || m > end) return
    const real = actuals[paidKey(m, l.sourceId)]
    if (real !== undefined && real !== Math.abs(l.amount)) {
      l = { ...l, planned: l.amount, amount: l.amount < 0 ? -real : real }
    }
    const arr = lines.get(m)
    if (arr) arr.push(l)
    else lines.set(m, [l])
  }
  const pointed = paidKeys(plan)
  const settled = (m: MonthKey, id: string) => pointed.has(paidKey(m, id))

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
    const typed = i > 0 ? plan.openings?.[m] : undefined
    const opening = typed ?? balance
    balance = opening + incomes - outflows
    rows.push({
      month: m,
      opening,
      ...(typed !== undefined && typed !== row0Balance(rows) ? { plannedOpening: row0Balance(rows) } : {}),
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
