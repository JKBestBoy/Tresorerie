import { monthOf } from './month'
import { project } from './projection'
import type { Cents, MonthKey, MonthRow, Plan, PlannedExpense } from './types'

export interface Breach {
  month: MonthKey
  /** Combien il manque pour revenir au niveau du matelas (positif) */
  shortfall: Cents
}

export interface CushionReport {
  /** Premier mois où le solde de fin passe sous le matelas */
  firstBreach: Breach | null
  /** Pire mois (plus grand manque) */
  worstBreach: Breach | null
  /** Plus petit solde de fin sur la période considérée */
  minClosing: { month: MonthKey; closing: Cents } | null
}

/** Analyse les mois >= fromMonth par rapport au matelas. */
export function cushionReport(rows: MonthRow[], cushion: Cents, fromMonth?: MonthKey): CushionReport {
  const scope = fromMonth ? rows.filter((r) => r.month >= fromMonth) : rows
  let firstBreach: Breach | null = null
  let worstBreach: Breach | null = null
  let minClosing: CushionReport['minClosing'] = null
  for (const r of scope) {
    if (!minClosing || r.closing < minClosing.closing) minClosing = { month: r.month, closing: r.closing }
    if (r.closing < cushion) {
      const b = { month: r.month, shortfall: cushion - r.closing }
      if (!firstBreach) firstBreach = b
      if (!worstBreach || b.shortfall > worstBreach.shortfall) worstBreach = b
    }
  }
  return { firstBreach, worstBreach, minClosing }
}

/**
 * Marge disponible à partir d'un mois : une dépense de X € en `fromMonth` fait
 * baisser de X tous les soldes de fin à partir de ce mois. Elle reste "sans
 * risque" tant que X <= min(soldes de fin) - matelas.
 * Retourne la marge brute (peut être négative si on est déjà sous le matelas).
 */
export function marginFrom(rows: MonthRow[], cushion: Cents, fromMonth: MonthKey): Cents | null {
  const { minClosing } = cushionReport(rows, cushion, fromMonth)
  return minClosing ? minClosing.closing - cushion : null
}

/** "Montant que je peux dépenser librement aujourd'hui" (jamais négatif). */
export function freeToSpend(
  rows: MonthRow[],
  cushion: Cents,
  currentMonth: MonthKey = monthOf(new Date()),
): { amount: Cents; alreadyShort: Cents } {
  const margin = marginFrom(rows, cushion, currentMonth) ?? 0
  return { amount: Math.max(0, margin), alreadyShort: Math.max(0, -margin) }
}

export interface WhatIfInput {
  amount: Cents
  month: MonthKey
  installments: number
}

export type WhatIfVerdict =
  | { ok: true; remainingMargin: Cents }
  | {
      ok: false
      firstBreach: Breach
      worstBreach: Breach
      /** Le plan de base était déjà sous le matelas sur cette période */
      baseAlreadyShort: boolean
    }

export interface WhatIfResult {
  base: MonthRow[]
  simulated: MonthRow[]
  verdict: WhatIfVerdict
  /** Montant maximum dépensable en un coup ce mois-là sans passer sous le matelas */
  maxSpendInMonth: Cents
}

export function whatIf(
  plan: Plan,
  input: WhatIfInput,
  currentMonth: MonthKey = monthOf(new Date()),
): WhatIfResult {
  const base = project(plan, [], currentMonth)
  const extra: PlannedExpense = {
    id: '__what-if__',
    label: 'Simulation',
    totalAmount: input.amount,
    month: input.month,
    installments: input.installments,
  }
  const simulated = project(plan, [extra], currentMonth)
  const report = cushionReport(simulated, plan.safetyCushion, input.month)
  const baseReport = cushionReport(base, plan.safetyCushion, input.month)
  const verdict: WhatIfVerdict =
    report.firstBreach && report.worstBreach
      ? {
          ok: false,
          firstBreach: report.firstBreach,
          worstBreach: report.worstBreach,
          baseAlreadyShort: baseReport.firstBreach !== null,
        }
      : { ok: true, remainingMargin: (report.minClosing?.closing ?? 0) - plan.safetyCushion }
  return {
    base,
    simulated,
    verdict,
    maxSpendInMonth: Math.max(0, marginFrom(base, plan.safetyCushion, input.month) ?? 0),
  }
}
