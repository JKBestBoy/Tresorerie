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
export function lineFor(t: Transaction, category: string, lines: PlanLine[], plan: Plan, nameOnly = false): PlanLine | undefined {
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
  if (byName[0] || nameOnly) return byName[0]
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

/**
 * Valeur « investissement / épargne » : l'argent quitte le compte mais reste dans le patrimoine
 * (achat de crypto, versement sur un courtier, un livret…). Ni dépense ni rentrée.
 */
export const INVEST = '__invest__'

/** Rentrée qui rembourse une dépense non prévue (ex. un ami vous rend sa part) : déduite du « non prévu ». */
export const REFUND = '__refund__'

/** Virement entre deux de vos comptes : ni dépense, ni rentrée (l'argent ne fait que changer de compte). */
export const TRANSFER = '__transfer__'

/**
 * Virement entre mes comptes rattaché, pour information, à une ligne (ex. « pour payer Internet ») :
 * stocké comme « __transfer__|idLigne ». Il reste ignoré dans les totaux (pas de double comptage).
 */
export const transferWith = (lineId: string | null) => (lineId ? `${TRANSFER}|${lineId}` : TRANSFER)
const isTransferValue = (v?: string | null) => !!v && (v === TRANSFER || v.startsWith(`${TRANSFER}|`))
const transferLineOf = (v?: string | null) => (v && v.startsWith(`${TRANSFER}|`) ? v.slice(TRANSFER.length + 1) : null)

/** Ligne associée à un virement entre mes comptes (choix pour l'opération, sinon pour le commerçant), ou null. */
export function transferNote(t: Transaction, plan: Plan): string | null {
  if (isTransferValue(t.category)) return transferLineOf(t.category)
  return transferLineOf(plan.txRules?.links[`m:${merchantKey(t.label)}`])
}

const TRANSFER_KEYWORDS = ['top up', 'topup', 'virement interne', 'compte a compte', 'own account', 'eigen rekening', 'entre mes comptes']

/**
 * Virements entre vos comptes retrouvés dans les relevés : une sortie sur un compte et une entrée
 * du même montant sur un autre compte, à 4 jours près.
 */
export function findTransfers(all: Transaction[]): Set<string> {
  const out = new Set<string>()
  const ins = all.filter((t) => t.amount > 0 && t.account)
  const days = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
  for (const t of all) {
    if (t.amount >= 0 || !t.account || out.has(t.id)) continue
    const match = ins.find((i) => !out.has(i.id) && i.account !== t.account && i.amount === -t.amount && Math.abs(days(i.date) - days(t.date)) <= 4)
    if (match) {
      out.add(t.id)
      out.add(match.id)
    }
  }
  return out
}

const looksLikeTransfer = (t: Transaction) => TRANSFER_KEYWORDS.some((k) => tokens(`${t.label} ${t.description}`).includes(` ${k} `))

/** Une ligne de dépense (et non de revenu) ? */
export const isExpenseKind = (kind: string) => kind === 'fixedExpense' || kind === 'plannedExpense'

/**
 * Lignes auxquelles une opération peut être rattachée : une dépense va sur une ligne de dépense ;
 * une rentrée va sur un revenu, ou sur une dépense qu'elle rembourse (déduite de cette dépense).
 */
export function targetsFor(plan: Plan, amount: Cents): { id: string; label: string }[] {
  return amount < 0 ? lineOptions(plan, -1) : [...lineOptions(plan, 1), ...lineOptions(plan, -1)]
}

const INVEST_KEYWORDS = [
  'trade republic', 'traderepublic', 'binance', 'okx', 'coinbase', 'kraken', 'bitpanda', 'bitstack', 'crypto com', 'bitvavo', 'paymium',
  'degiro', 'scalable', 'bourse direct', 'saxo', 'interactive brokers', 'etoro', 'xtb', 'freedom24', 'yomoni', 'nalo', 'linxea', 'ramify',
  'goodvest', 'lucya', 'meilleurtaux placement', 'livret', 'epargne', 'savings', 'spaarrekening',
]
const tokens = (s: string) => ` ${normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim()} `

/** L'opération ressemble-t-elle à un placement (courtier, plateforme crypto, livret, ou un de vos investissements) ? */
export function looksLikeInvestment(t: Transaction, plan: Plan): boolean {
  const text = tokens(`${t.label} ${t.description}`)
  if (INVEST_KEYWORDS.some((k) => text.includes(` ${k} `))) return true
  for (const inv of plan.investments ?? []) {
    for (const name of [inv.account, inv.label]) {
      const w = name ? tokens(name).trim() : ''
      if (w.length >= 3 && text.includes(` ${w} `)) return true
    }
  }
  return false
}

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
export function assignedLine(t: Transaction, plan: Plan, monthLines: PlanLine[], transfers?: Set<string>): string | null {
  const exists = (id: string) => id === INVEST || id === TRANSFER || (id === REFUND && t.amount > 0) || targetsFor(plan, t.amount).some((o) => o.id === id)
  // Rentrée classée « autre rentrée » (NONE) : on la garde telle quelle
  if (isTransferValue(t.category)) return TRANSFER
  if (t.category === NONE) return t.amount > 0 ? NONE : null
  if (t.category && exists(t.category)) return t.category
  const rule = plan.txRules?.links[`m:${merchantKey(t.label)}`]
  if (rule === NONE) return t.amount > 0 ? NONE : null
  if (!t.category && isTransferValue(rule)) return TRANSFER
  if (rule && exists(rule)) return rule
  if (transfers?.has(t.id) || looksLikeTransfer(t)) return TRANSFER
  // Placement reconnu : sauf si une de vos lignes porte ce nom (ex. dépense fixe « DCA Binance »)
  if (looksLikeInvestment(t, plan)) return lineFor(t, categoryOf(t, plan), monthLines, plan, true)?.id ?? INVEST
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
  /** Dépenses rattachées à aucune ligne (et leurs remboursements) : là où se cache l'écart */
  unplanned: Transaction[]
  unplannedTotal: Cents // positif, net des remboursements
  /** Remboursements reçus, déjà déduits des dépenses (positif) */
  refunds: Cents
  /** Rentrées rattachées à rien (ni revenu, ni remboursement) */
  otherIn: Transaction[]
  /** Placé ce mois (net : versements − retraits), hors dépenses et rentrées */
  invested: Cents
  investTxs: Transaction[]
  /** Virements entre vos comptes (ignorés dans les totaux) */
  transfers: Transaction[]
}

/** Analyse des opérations d'un mois, ligne par ligne de « Mes données ». */
export function analyzeMonth(plan: Plan, all: Transaction[], month: MonthKey, account?: string | null): MonthAnalysis {
  // Les virements se cherchent sur tous les comptes, avant de filtrer sur le compte choisi
  const pairs = findTransfers(all)
  const txs = all.filter((t) => monthOfTx(t) === month && (!account || t.account === account))
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
  const otherIn: Transaction[] = []
  let refunds = 0
  let spent = 0
  let received = 0
  let invested = 0
  const investTxs: Transaction[] = []
  const transfers: Transaction[] = []
  for (const t of txs) {
    const id = assignedLine(t, plan, monthLines, pairs)
    if (id === TRANSFER) {
      transfers.push(t)
      continue
    }
    if (id === INVEST) {
      invested -= t.amount
      investTxs.push(t)
      continue
    }
    const st = id ? lines.find((l) => l.id === id) : undefined
    if (t.amount < 0) spent += -t.amount
    else if (id === REFUND || (st && isExpenseKind(st.kind))) {
      // Remboursement : déduit des dépenses, pas compté comme rentrée
      spent -= t.amount
      refunds += t.amount
    } else received += t.amount
    if (st) {
      st.real += t.amount
      st.txs.push({ ...t, matchedId: st.id })
    } else if (t.amount < 0 || id === REFUND) unplanned.push(t)
    else otherIn.push(t)
  }
  return {
    month,
    spent,
    received,
    plannedSpent: monthLines.filter((l) => l.planned < 0).reduce((sum, l) => sum - l.planned, 0),
    lines,
    unplanned: unplanned.sort((x, y) => x.amount - y.amount),
    unplannedTotal: unplanned.reduce((sum, t) => sum - t.amount, 0),
    refunds,
    otherIn,
    invested,
    investTxs: investTxs.sort((x, y) => x.amount - y.amount),
    transfers,
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
