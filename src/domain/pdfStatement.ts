import { parseAmount, type ColumnRole, type ParsedCsv } from './statement'

/**
 * Lecture d'un relevé PDF déjà converti en lignes de texte.
 * Chaque opération est une ligne qui contient une date, un libellé et un ou plusieurs montants.
 */

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, july: 7,
  aou: 8, aout: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const pad = (n: number | string) => String(n).padStart(2, '0')
const MONTH_RE = '(janv(?:ier)?|f[ée]vr?(?:ier)?|mars?|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t?|sept?(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?|jan(?:uary)?|feb(?:ruary)?|march|apr(?:il)?|may|june?|july?|aug(?:ust)?|september|october|november|december)\\.?'

interface DateHit {
  iso: string
  index: number
  length: number
}

/** Première date trouvée dans la ligne (formats numériques, « 12 nov. 2026 », « Nov 12, 2026 »). */
export function findDate(line: string, fallbackYear?: number): DateHit | null {
  const patterns: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => `${m[1]}-${pad(m[2])}-${pad(m[3])}`],
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/, (m) => `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[2])}-${pad(m[1])}`],
    [
      new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\s*(\\d{4})?`, 'i'),
      (m) => {
        const mo = MONTHS[strip(m[2]).replace(/\.$/, '')] ?? MONTHS[strip(m[2]).slice(0, 4)] ?? MONTHS[strip(m[2]).slice(0, 3)]
        const y = m[3] ? Number(m[3]) : fallbackYear
        return mo && y ? `${y}-${pad(mo)}-${pad(m[1])}` : null
      },
    ],
    [
      new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'),
      (m) => {
        const mo = MONTHS[strip(m[1]).slice(0, 4)] ?? MONTHS[strip(m[1]).slice(0, 3)]
        return mo ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : null
      },
    ],
  ]
  let best: DateHit | null = null
  for (const [re, toIso] of patterns) {
    const m = re.exec(line)
    if (!m) continue
    const iso = toIso(m)
    if (!iso || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(iso)) continue
    if (!best || m.index < best.index) best = { iso, index: m.index, length: m[0].length }
  }
  return best
}

/** Montants présents dans la ligne : « -12,14 », « 1 250,00 € », « € 12.14 », « + 1.300,00 ». */
const MONEY = /(?:^|[\s(])([-+−]?\s?€?\s?\d{1,3}(?:[ .\u00a0\u202f]\d{3})*[.,]\d{2}|[-+−]?\s?€?\s?\d+[.,]\d{2})(?:\s?€|\s?EUR)?(?=$|[\s)])/g

interface MoneyHit {
  raw: string
  value: number // centimes, signe inclus
  signed: boolean
  index: number
}

export function findAmounts(line: string): MoneyHit[] {
  const out: MoneyHit[] = []
  for (const m of line.matchAll(MONEY)) {
    const raw = m[1]
    const v = parseAmount(raw.replace('€', ''))
    if (v === null) continue
    out.push({ raw, value: v, signed: /^[-+−]/.test(raw.trim()), index: (m.index ?? 0) + m[0].indexOf(raw) })
  }
  return out
}

const SKIP = /\b(solde|balance|saldo|total|report|ancien solde|nouveau solde|opening|closing|page \d)/i

export interface PdfOptions {
  /** Quel montant prendre quand la ligne en contient plusieurs (ex. montant puis solde) */
  pick: 'last' | 'secondLast'
  /** Signe des montants écrits sans + ni − */
  unsigned: 'expense' | 'income'
}

export interface PdfParse {
  csv: ParsedCsv
  roles: ColumnRole[]
  /** Réglage conseillé pour le choix du montant, d'après le relevé */
  suggestedPick: PdfOptions['pick']
  lines: number
}

/** Transforme les lignes de texte d'un relevé PDF en tableau date / libellé / montant. */
export function parsePdfLines(lines: string[], opts?: Partial<PdfOptions>): PdfParse {
  const yearHint = (() => {
    for (const l of lines) {
      const y = l.match(/\b(20\d{2})\b/)
      if (y) return Number(y[1])
    }
    return new Date().getFullYear()
  })()
  const candidates: { date: DateHit; amounts: MoneyHit[]; line: string }[] = []
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || SKIP.test(line)) continue
    const date = findDate(line, yearHint)
    if (!date) continue
    const amounts = findAmounts(line).filter((a) => a.index >= date.index + date.length || a.index < date.index)
    if (amounts.length === 0) continue
    candidates.push({ date, amounts, line })
  }
  const multi = candidates.filter((c) => c.amounts.length >= 2).length
  const suggestedPick: PdfOptions['pick'] = candidates.length > 0 && multi / candidates.length >= 0.7 ? 'secondLast' : 'last'
  const pick = opts?.pick ?? suggestedPick
  const unsigned = opts?.unsigned ?? 'expense'
  const rows: string[][] = []
  for (const c of candidates) {
    const a = pick === 'secondLast' && c.amounts.length >= 2 ? c.amounts[c.amounts.length - 2] : c.amounts[c.amounts.length - 1]
    let value = a.value
    if (!a.signed) value = unsigned === 'expense' ? -Math.abs(value) : Math.abs(value)
    // Libellé : le texte entre la date et le montant, sans autre date (date de valeur) ni autre montant
    let label = c.line.slice(c.date.index + c.date.length, a.index)
    for (const other of c.amounts) label = label.replace(other.raw, ' ')
    const second = findDate(label, yearHint)
    if (second && second.index < 3) label = label.slice(second.index + second.length)
    label = label.replace(/[€|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Opération'
    rows.push([c.date.iso, label, (value / 100).toFixed(2)])
  }
  return {
    csv: { header: ['Date', 'Libellé', 'Montant'], rows, delimiter: ';' },
    roles: ['date', 'label', 'amount'],
    suggestedPick,
    lines: lines.length,
  }
}
