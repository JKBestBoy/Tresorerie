import type { Cents, MonthKey } from './types'

/** Une opération bancaire importée d'un relevé. */
export interface Transaction {
  /** Empreinte (date + montant + libellé + rang) : évite les doublons si on réimporte */
  id: string
  date: string // AAAA-MM-JJ
  /** Signé : négatif = dépense, positif = rentrée */
  amount: Cents
  /** Commerçant / contrepartie */
  label: string
  /** Libellé complet de l'opération */
  description: string
  category?: string
  /** Ligne du plan rapprochée (dépense fixe, revenu, échéance) */
  matchedId?: string
}

export type ColumnRole = 'date' | 'amount' | 'debit' | 'credit' | 'label' | 'description' | 'ignore'

export interface ParsedCsv {
  header: string[]
  rows: string[][]
  delimiter: string
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Lit un CSV (séparateur ; , ou tabulation, guillemets, retours à la ligne dans les champs). */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length] as const)
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0]
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) out.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) out.push(row)
  const [header = [], ...rows] = out
  return { header: header.map((h) => h.trim()), rows, delimiter }
}

/** Devine le rôle de chaque colonne d'après son titre (français, anglais, néerlandais). */
export function detectColumns(header: string[]): ColumnRole[] {
  const roles: ColumnRole[] = header.map((h) => {
    const n = norm(h)
    if (/^(date|datum|date operation|date de l.?operation|booking date|transaction date|date comptable)$/.test(n) || /^date( |$)/.test(n)) return 'date'
    if (/(interest date|rentedatum|date de valeur|value date)/.test(n)) return 'ignore'
    if (/^(amount|montant|bedrag|somme)( .*)?$/.test(n) || /montant/.test(n)) return 'amount'
    if (/^(debit|debet|retrait|sortie)/.test(n)) return 'debit'
    if (/^(credit|depot|entree)/.test(n)) return 'credit'
    if (/^(name|naam|nom|beneficiaire|payee|merchant|commercant|nom du beneficiaire|tegenpartij naam)$/.test(n)) return 'label'
    // Contrepartie : souvent un IBAN chez bunq ; utilisée seulement s'il n'y a pas de colonne « nom »
    if (/(counterparty|tegenpartij|contrepartie)/.test(n)) return 'ignore'
    if (/(description|omschrijving|libelle|details|communication|motif|reference)/.test(n)) return 'description'
    return 'ignore'
  })
  if (!roles.includes('label')) {
    const i = header.findIndex((h) => /(counterparty|tegenpartij|contrepartie)/.test(norm(h)))
    if (i >= 0) roles[i] = 'label'
  }
  // Une seule colonne date / montant : on garde la première
  for (const r of ['date', 'amount', 'label'] as const) {
    let seen = false
    roles.forEach((x, i) => {
      if (x === r) {
        if (seen) roles[i] = r === 'label' ? 'description' : 'ignore'
        seen = true
      }
    })
  }
  return roles
}

/** « 1.234,56 », « -12,30 », « 1,234.56 », « 12.3 », « −5 € » → centimes. */
export function parseAmount(raw: string): Cents | null {
  let s = raw.replace(/[\s\u00a0\u202f€$£]/g, '').replace('\u2212', '-')
  if (!s) return null
  let neg = false
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    neg = true
    s = s.slice(0, -1)
  }
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null
  const v = Math.round(parseFloat(s) * 100)
  return neg ? -Math.abs(v) : v
}

/** « 2026-11-14 », « 14/11/2026 », « 14-11-2026 », « 14.11.26 » → AAAA-MM-JJ. */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export interface ImportResult {
  transactions: Transaction[]
  skipped: number
}

/** Transforme les lignes du CSV en opérations, selon le rôle choisi pour chaque colonne. */
export function toTransactions(csv: ParsedCsv, roles: ColumnRole[]): ImportResult {
  const col = (r: ColumnRole) => roles.indexOf(r)
  const iDate = col('date')
  const iAmount = col('amount')
  const iDebit = col('debit')
  const iCredit = col('credit')
  const iLabel = col('label')
  const iDesc = col('description')
  const seen = new Map<string, number>()
  const transactions: Transaction[] = []
  let skipped = 0
  for (const r of csv.rows) {
    const date = iDate >= 0 ? parseDate(r[iDate] ?? '') : null
    let amount: Cents | null = null
    if (iAmount >= 0) amount = parseAmount(r[iAmount] ?? '')
    else {
      const d = iDebit >= 0 ? parseAmount(r[iDebit] ?? '') : null
      const c = iCredit >= 0 ? parseAmount(r[iCredit] ?? '') : null
      if (d !== null || c !== null) amount = (c ?? 0) - Math.abs(d ?? 0)
    }
    if (!date || amount === null) {
      skipped++
      continue
    }
    const description = (iDesc >= 0 ? r[iDesc] : '')?.trim() ?? ''
    const label = ((iLabel >= 0 ? r[iLabel] : '')?.trim() || description.split(/\s{2,}| - /)[0] || 'Opération').slice(0, 120)
    const base = `${date}|${amount}|${norm(label)}|${norm(description)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    transactions.push({ id: hash(`${base}|${n}`), date, amount, label, description })
  }
  return { transactions, skipped }
}

export const monthOfTx = (t: Transaction): MonthKey => t.date.slice(0, 7)
export { norm as normalizeText }
