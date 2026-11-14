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
  return undefined
}

export interface CategoryTotal {
  id: string
  label: string
  total: Cents // positif
  count: number
}

export interface LineStatus extends PlanLine {
  /** Total réel des opérations rapprochées (signé) */
  real: Cents
  txs: Transaction[]
}

export interface MonthAnalysis {
  month: MonthKey
  spent: Cents // total des dépenses (positif)
  received: Cents // total des rentrées (positif)
  plannedSpent: Cents // dépenses prévues ce mois (positif)
  byCategory: CategoryTotal[]
  lines: LineStatus[]
  /** Dépenses rapprochées d'aucune ligne du plan : là où se cache l'écart */
  unplanned: Transaction[]
  unplannedTotal: Cents // positif
}

export function categoryOf(t: Transaction, plan: Plan): string {
  return t.category ?? categorize(t, plan.txRules?.categories)
}

/** Analyse des opérations d'un mois, comparées au plan. */
export function analyzeMonth(plan: Plan, all: Transaction[], month: MonthKey): MonthAnalysis {
  const txs = all.filter((t) => monthOfTx(t) === month)
  const lines: LineStatus[] = planLinesOf(plan, month).map((l) => ({ ...l, real: 0, txs: [] }))
  const cats = new Map<string, CategoryTotal>()
  const unplanned: Transaction[] = []
  let spent = 0
  let received = 0
  for (const t of txs) {
    const category = categoryOf(t, plan)
    if (t.amount < 0) {
      spent += -t.amount
      const c = cats.get(category) ?? { id: category, label: CATEGORIES.find((x) => x.id === category)?.label ?? 'Autres', total: 0, count: 0 }
      c.total += -t.amount
      c.count++
      cats.set(category, c)
    } else received += t.amount
    const line = lineFor(t, category, lines, plan)
    if (line) {
      const st = lines.find((l) => l.id === line.id)!
      st.real += t.amount
      st.txs.push({ ...t, category, matchedId: line.id })
    } else if (t.amount < 0) unplanned.push({ ...t, category })
  }
  return {
    month,
    spent,
    received,
    plannedSpent: lines.filter((l) => l.planned < 0).reduce((s, l) => s - l.planned, 0),
    byCategory: [...cats.values()].sort((a, b) => b.total - a.total),
    lines,
    unplanned: unplanned.sort((a, b) => a.amount - b.amount),
    unplannedTotal: unplanned.reduce((s, t) => s - t.amount, 0),
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
