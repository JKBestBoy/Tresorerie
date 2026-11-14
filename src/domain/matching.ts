import { CATEGORIES, categorize, merchantKey } from './categories'
import { project } from './projection'
import { monthOfTx, normalizeText, type Transaction } from './statement'
import type { Cents, MonthKey, Plan } from './types'

export interface PlanLine {
  id: string
  label: string
  kind: string
  /** Montant prévu ce mois-ci (signé) */
  planned: Cents
}

/** Lignes du plan qui tombent un mois donné (revenus, dépenses fixes, échéances, rentrées ponctuelles). */
export function planLinesOf(plan: Plan, month: MonthKey): PlanLine[] {
  const rows = project(plan, [], month < monthOfStart(plan) ? monthOfStart(plan) : month)
  const row = rows.find((r) => r.month === month)
  if (!row) return []
  const byId = new Map<string, PlanLine>()
  for (const d of row.details) {
    if (d.kind === 'gap') continue
    const planned = d.planned ?? d.amount
    const prev = byId.get(d.sourceId)
    if (prev) prev.planned += planned
    else byId.set(d.sourceId, { id: d.sourceId, label: d.label.replace(/ \(\d+\/\d+\)$/, ''), kind: d.kind, planned })
  }
  return [...byId.values()]
}
const monthOfStart = (plan: Plan) => plan.startingCapital.date.slice(0, 7)

const words = (s: string) => normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3)

/**
 * Ligne du plan correspondant à une opération :
 * 1. lien appris pour ce commerçant ; 2. lien appris pour sa catégorie ;
 * 3. nom de la ligne retrouvé dans le libellé (ex. « Spotify ») ; 4. ligne qui porte le nom de la catégorie (« Courses »).
 */
export function lineFor(t: Transaction, category: string, lines: PlanLine[], plan: Plan): PlanLine | undefined {
  const links = plan.txRules?.links ?? {}
  const sameSign = (l: PlanLine) => Math.sign(l.planned) === Math.sign(t.amount) || l.planned === 0
  const byId = (id?: string) => (id ? lines.find((l) => l.id === id) : undefined)
  const m = byId(links[`m:${merchantKey(t.label)}`]) ?? byId(links[`c:${category}`])
  if (m) return m
  const text = ` ${normalizeText(`${t.label} ${t.description}`)} `
  const byName = lines
    .filter(sameSign)
    .filter((l) => {
      const w = words(l.label)
      return w.length > 0 && w.every((x) => text.includes(x))
    })
    // Le nom ne suffit pas si le montant n'a rien à voir (ex. « Apple » 9,99 € ≠ achat Apple Store 249 €)
    .filter((l) => Math.abs(t.amount) <= Math.abs(l.planned) * 2 + 1000)
    .sort((a, b) => Math.abs(Math.abs(a.planned) - Math.abs(t.amount)) - Math.abs(Math.abs(b.planned) - Math.abs(t.amount)))
  if (byName[0]) return byName[0]
  const cat = CATEGORIES.find((c) => c.id === category)
  if (cat) {
    const catWords = words(cat.label)
    const named = lines.filter(sameSign).find((l) => {
      const w = words(l.label)
      return w.length > 0 && w.some((x) => catWords.includes(x))
    })
    if (named) return named
  }
  // Même montant que prévu (à 50 centimes près), si une seule ligne correspond (ex. virement de 210 € = loyer)
  const sameAmount = lines.filter(sameSign).filter((l) => l.planned !== 0 && Math.abs(Math.abs(l.planned) - Math.abs(t.amount)) <= 50)
  if (sameAmount.length === 1) return sameAmount[0]
  // Rentrée proche d'un revenu prévu ce mois-ci (à 15 % près)
  if (t.amount > 0) {
    const near = lines
      .filter((l) => l.planned > 0 && Math.abs(l.planned - t.amount) <= l.planned * 0.15)
      .sort((x, y) => Math.abs(x.planned - t.amount) - Math.abs(y.planned - t.amount))
    if (near[0]) return near[0]
  }
  return undefined
}

/** Valeur « non prévu » (aucune ligne) pour une opération ou un commerçant. */
export const NONE = '__none__'

/** Lignes de « Mes données » auxquelles rattacher une opération (dépenses ou rentrées selon le signe). */
export function lineOptions(plan: Plan, sign: number): { id: string; label: string }[] {
  if (sign < 0)
    return [
      ...plan.fixedExpenses.map((f) => ({ id: f.id, label: f.label || 'Dépense fixe' })),
      ...plan.plannedExpenses.map((e) => ({ id: e.id, label: e.label || 'Grosse dépense' })),
    ]
  return [
    ...plan.incomePeriods.map((i) => ({ id: i.id, label: i.label || 'Revenu' })),
    ...plan.oneOffIncomes.map((o) => ({ id: o.id, label: o.label || 'Rentrée' })),
  ]
}

/** Indice interne : famille de dépense devinée d'après le libellé (sert seulement à trouver la bonne ligne). */
export function categoryOf(t: Transaction, plan: Plan): string {
  return categorize(t, plan.txRules?.categories)
}

/**
 * Ligne de « Mes données » d'une opération, ou null (non prévue) :
 * 1. choix fait pour cette opération ; 2. choix fait pour ce commerçant ; 3. devinée (nom, famille).
 */
export function assignedLine(t: Transaction, plan: Plan, monthLines: PlanLine[]): string | null {
  const exists = (id: string) => lineOptions(plan, t.amount).some((o) => o.id === id)
  if (t.category === NONE) return null
  if (t.category && exists(t.category)) return t.category
  const rule = plan.txRules?.links[`m:${merchantKey(t.label)}`]
  if (rule === NONE) return null
  if (rule && exists(rule)) return rule
  return lineFor(t, categoryOf(t, plan), monthLines, plan)?.id ?? null
}

export interface LineStatus extends PlanLine {
  /** Total réel des opérations rattachées (signé) */
  real: Cents
  txs: Transaction[]
}

export interface MonthAnalysis {
  month: MonthKey
  spent: Cents // total des dépenses (positif)
  received: Cents // total des rentrées (positif)
  plannedSpent: Cents // dépenses prévues ce mois (positif)
  /** Toutes vos lignes de dépenses (et de rentrées) : prévu ce mois et réel */
  lines: LineStatus[]
  /** Dépenses rattachées à aucune ligne : là où se cache l'écart */
  unplanned: Transaction[]
  unplannedTotal: Cents // positif
}

/** Analyse des opérations d'un mois, ligne par ligne de « Mes données ». */
export function analyzeMonth(plan: Plan, all: Transaction[], month: MonthKey): MonthAnalysis {
  const txs = all.filter((t) => monthOfTx(t) === month)
  const monthLines = planLinesOf(plan, month)
  const planned = new Map(monthLines.map((l) => [l.id, l]))
  const kinds = new Map<string, string>([
    ...plan.fixedExpenses.map((x) => [x.id, 'fixedExpense'] as [string, string]),
    ...plan.plannedExpenses.map((x) => [x.id, 'plannedExpense'] as [string, string]),
    ...plan.incomePeriods.map((x) => [x.id, 'income'] as [string, string]),
    ...plan.oneOffIncomes.map((x) => [x.id, 'oneOffIncome'] as [string, string]),
  ])
  const lines: LineStatus[] = [...lineOptions(plan, -1), ...lineOptions(plan, 1)].map((o) => ({
    id: o.id,
    label: o.label,
    kind: kinds.get(o.id) ?? 'fixedExpense',
    planned: planned.get(o.id)?.planned ?? 0,
    real: 0,
    txs: [],
  }))
  const unplanned: Transaction[] = []
  let spent = 0
  let received = 0
  for (const t of txs) {
    if (t.amount < 0) spent += -t.amount
    else received += t.amount
    const id = assignedLine(t, plan, monthLines)
    const st = id ? lines.find((l) => l.id === id) : undefined
    if (st) {
      st.real += t.amount
      st.txs.push({ ...t, matchedId: st.id })
    } else if (t.amount < 0) unplanned.push(t)
  }
  return {
    month,
    spent,
    received,
    plannedSpent: monthLines.filter((l) => l.planned < 0).reduce((sum, l) => sum - l.planned, 0),
    lines,
    unplanned: unplanned.sort((x, y) => x.amount - y.amount),
    unplannedTotal: unplanned.reduce((sum, t) => sum - t.amount, 0),
  }
}

/** Mémorise une catégorie pour un commerçant. */
export function withCategoryRule(plan: Plan, label: string, category: string): Plan {
  const r = plan.txRules ?? { categories: {}, links: {} }
  return { ...plan, txRules: { ...r, categories: { ...r.categories, [merchantKey(label)]: category } } }
}

/** Associe un commerçant (ou toute une catégorie) à une ligne du plan ; `null` retire l'association. */
export function withLinkRule(plan: Plan, key: string, lineId: string | null): Plan {
  const r = plan.txRules ?? { categories: {}, links: {} }
  const links = { ...r.links }
  if (lineId) links[key] = lineId
  else delete links[key]
  return { ...plan, txRules: { ...r, links } }
}
