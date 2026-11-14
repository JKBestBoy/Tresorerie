import { describe, expect, it } from 'vitest'
import { categorize, merchantKey } from './categories'
import { NONE, analyzeMonth, withLinkRule } from './matching'
import { detectColumns, parseAmount, parseCsv, parseDate, toTransactions } from './statement'
import type { Plan } from './types'

const BUNQ = `"Date";"Interest Date";"Amount";"Account";"Counterparty";"Name";"Description"
"2026-11-02";"2026-11-02";"-210,00";"NL00BUNQ0000000001";"FR761234";"M. DUPONT";"Loyer novembre"
"2026-11-03";"2026-11-03";"-12,14";"NL00BUNQ0000000001";"";"Spotify AB";"SPOTIFY P1234567"
"2026-11-05";"2026-11-05";"-34,56";"NL00BUNQ0000000001";"";"CARREFOUR CITY 1234";"Paiement carte"
"2026-11-07";"2026-11-07";"-1.250,00";"NL00BUNQ0000000001";"";"APPLE STORE";"MacBook"
"2026-11-07";"2026-11-07";"-23,90";"NL00BUNQ0000000001";"";"UBER EATS";"Commande ""sushi"""
"2026-11-08";"2026-11-08";"1.300,00";"NL00BUNQ0000000001";"";"FRANCE TRAVAIL";"ARE novembre"
"2026-11-09";"2026-11-09";"-34,56";"NL00BUNQ0000000001";"";"CARREFOUR CITY 1234";"Paiement carte"
`

function plan(): Plan {
  return {
    schemaVersion: 1,
    startingCapital: { amount: 300000, date: '2026-11-01' },
    safetyCushion: 0,
    horizonMonths: 12,
    incomePeriods: [{ id: 'cho', label: 'Chômage', monthlyAmount: 130000, startMonth: null, endMonth: null }],
    oneOffIncomes: [],
    fixedExpenses: [
      { id: 'loy', label: 'Loyer', monthlyAmount: 21000, startMonth: null, endMonth: null },
      { id: 'spo', label: 'Spotify', monthlyAmount: 1214, startMonth: null, endMonth: null },
      { id: 'cou', label: 'Courses', monthlyAmount: 10000, startMonth: null, endMonth: null },
    ],
    plannedExpenses: [],
  }
}

describe('lecture du relevé', () => {
  it('montants et dates de tous formats', () => {
    expect(parseAmount('-1.250,00')).toBe(-125000)
    expect(parseAmount('1,234.56')).toBe(123456)
    expect(parseAmount('12,3')).toBe(1230)
    expect(parseAmount('−5 €')).toBe(-500)
    expect(parseAmount('45,00-')).toBe(-4500)
    expect(parseAmount('abc')).toBeNull()
    expect(parseDate('2026-11-14')).toBe('2026-11-14')
    expect(parseDate('14/11/2026')).toBe('2026-11-14')
    expect(parseDate('4.11.26')).toBe('2026-11-04')
  })

  it('CSV bunq : séparateur, guillemets, colonnes reconnues, doublons distingués', () => {
    const csv = parseCsv(BUNQ)
    expect(csv.delimiter).toBe(';')
    expect(csv.rows).toHaveLength(7)
    const roles = detectColumns(csv.header)
    expect(roles).toEqual(['date', 'ignore', 'amount', 'ignore', 'ignore', 'label', 'description'])
    const { transactions, skipped } = toTransactions(csv, roles)
    expect(skipped).toBe(0)
    expect(transactions[3]).toMatchObject({ date: '2026-11-07', amount: -125000, label: 'APPLE STORE' })
    expect(transactions[4].description).toBe('Commande "sushi"')
    // Deux achats identiques le même mois mais à des dates différentes : deux opérations distinctes
    expect(new Set(transactions.map((t) => t.id)).size).toBe(7)
    // Réimporter le même fichier donne les mêmes identifiants (pas de doublon)
    expect(toTransactions(parseCsv(BUNQ), roles).transactions.map((t) => t.id)).toEqual(transactions.map((t) => t.id))
  })

  it('colonnes débit / crédit séparées', () => {
    const csv = parseCsv('Date,Libellé,Débit,Crédit\n01/11/2026,CB LIDL,"12,50",\n02/11/2026,VIR SALAIRE,,"1500,00"\n')
    const roles = detectColumns(csv.header)
    expect(roles).toEqual(['date', 'description', 'debit', 'credit'])
    expect(toTransactions(csv, roles).transactions.map((t) => t.amount)).toEqual([-1250, 150000])
  })
})

describe('catégories', () => {
  it('mots-clés et règles apprises', () => {
    const tx = (label: string, amount = -1000) => ({ id: 'x', date: '2026-11-01', amount, label, description: '' })
    expect(categorize(tx('CARREFOUR CITY 1234'))).toBe('courses')
    expect(categorize(tx('UBER EATS'))).toBe('restaurants')
    expect(categorize(tx('UBER TRIP'))).toBe('transport')
    expect(categorize(tx('Inconnu SARL'))).toBe('autres')
    expect(categorize(tx('Inconnu SARL', 5000))).toBe('revenus')
    expect(merchantKey('CB CARREFOUR CITY 1234 PARIS')).toBe('carrefour city paris')
    expect(categorize(tx('Inconnu SARL'), { [merchantKey('Inconnu SARL')]: 'shopping' })).toBe('shopping')
  })
})

describe('analyse du mois', () => {
  const csv = parseCsv(BUNQ)
  const txs = toTransactions(csv, detectColumns(csv.header)).transactions

  it('rapproche du plan et isole ce qui n’était pas prévu', () => {
    const a = analyzeMonth(plan(), txs, '2026-11')
    expect(a.spent).toBe(21000 + 1214 + 3456 + 125000 + 2390 + 3456)
    expect(a.received).toBe(130000)
    const line = (id: string) => a.lines.find((l) => l.id === id)!
    expect(line('spo').real).toBe(-1214) // nom retrouvé dans le libellé
    expect(line('cou').real).toBe(-6912) // catégorie Courses → ligne « Courses »
    expect(line('loy').real).toBe(-21000) // « Loyer » retrouvé dans le libellé de l'opération
    // Non prévu : triés du plus gros au plus petit
    expect(a.unplanned.map((t) => t.label)).toEqual(['APPLE STORE', 'UBER EATS'])
    expect(a.unplannedTotal).toBe(125000 + 2390)
    expect(a.unplanned[0].label).toBe('APPLE STORE')
    // Toutes les lignes de « Mes données » sont présentes, même sans opération
    expect(a.lines.map((l) => l.id)).toEqual(['loy', 'spo', 'cou', 'cho'])
    expect(a.lines.find((l) => l.id === 'cho')!.real).toBe(130000) // rentrée de 1 300 € = revenu prévu de 1 300 €
    
  })

  it('même montant que prévu : virement de 210 € = loyer', () => {
    const t = { id: 'v', date: '2026-11-02', amount: -21000, label: 'SCI DUPONT', description: 'Virement novembre' }
    const a = analyzeMonth(plan(), [t], '2026-11')
    expect(a.lines.find((l) => l.id === 'loy')!.real).toBe(-21000)
  })

  it('un nom identique ne suffit pas si le montant est sans rapport', () => {
    const p = { ...plan(), fixedExpenses: [...plan().fixedExpenses, { id: 'app', label: 'Apple', monthlyAmount: 999, startMonth: null, endMonth: null }] }
    const a = analyzeMonth(p, txs, '2026-11')
    expect(a.lines.find((l) => l.id === 'app')!.real).toBe(0) // l'achat APPLE STORE (1 250 €) n'est pas l'abonnement
    expect(a.unplanned.map((t) => t.label)).toContain('APPLE STORE')
  })

  it('classement manuel : pour ce commerçant, pour une opération, ou « non prévu »', () => {
    // « Uber Eats, c'est dans mon budget Courses » (tous les Uber Eats)
    let p = withLinkRule(plan(), `m:${merchantKey('UBER EATS')}`, 'cou')
    let a = analyzeMonth(p, txs, '2026-11')
    expect(a.lines.find((l) => l.id === 'cou')!.real).toBe(-6912 - 2390)
    expect(a.unplanned.map((t) => t.label)).toEqual(['APPLE STORE'])
    // Cet achat Apple Store précis : dans « Courses » aussi (cette opération seulement)
    const apple = txs.find((t) => t.label === 'APPLE STORE')!
    a = analyzeMonth(p, txs.map((t) => (t.id === apple.id ? { ...t, category: 'cou' } : t)), '2026-11')
    expect(a.unplanned).toEqual([])
    // Et Spotify forcé en « non prévu »
    p = withLinkRule(p, `m:${merchantKey('Spotify AB')}`, NONE)
    a = analyzeMonth(p, txs, '2026-11')
    expect(a.lines.find((l) => l.id === 'spo')!.real).toBe(0)
    expect(a.unplanned.map((t) => t.label)).toContain('Spotify AB')
    // Une ligne supprimée de « Mes données » n'est plus proposée : l'opération redevient non prévue
    a = analyzeMonth({ ...p, fixedExpenses: p.fixedExpenses.filter((f) => f.id !== 'cou') }, txs, '2026-11')
    expect(a.unplanned.map((t) => t.label)).toContain('UBER EATS')
  })
})
