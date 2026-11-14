import { describe, expect, it } from 'vitest'
import { findAmounts, findDate, parsePdfLines } from './pdfStatement'
import { toTransactions } from './statement'

describe('relevé PDF', () => {
  it('dates de tous formats', () => {
    expect(findDate('02/11/2026 SPOTIFY')?.iso).toBe('2026-11-02')
    expect(findDate('2026-11-02 SPOTIFY')?.iso).toBe('2026-11-02')
    expect(findDate('2 nov. 2026 Spotify')?.iso).toBe('2026-11-02')
    expect(findDate('12 décembre Carrefour', 2026)?.iso).toBe('2026-12-12')
    expect(findDate('Nov 2, 2026 Spotify AB')?.iso).toBe('2026-11-02')
    expect(findDate('Facture 1234 sans date')).toBeNull()
  })

  it('montants', () => {
    expect(findAmounts('SPOTIFY -12,14 € 3 487,90 €').map((a) => a.value)).toEqual([-1214, 348790])
    expect(findAmounts('Virement + 1.300,00').map((a) => a.value)).toEqual([130000])
    expect(findAmounts('Carte 1234 5678').length).toBe(0) // pas de centimes : pas un montant
  })

  it('relevé type bunq (montant puis solde, signes explicites)', () => {
    const lines = [
      'bunq B.V. – Relevé de compte – novembre 2026',
      'Date Description Montant Solde',
      'Ancien solde 3 860,15 €',
      '02 nov. 2026 SCI DUPONT Virement novembre -210,00 € 3 650,15 €',
      '03 nov. 2026 Spotify AB SPOTIFY P1234567 -12,14 € 3 638,01 €',
      '08 nov. 2026 FRANCE TRAVAIL ARE + 1.300,00 € 4 938,01 €',
      '12 nov. 2026 APPLE STORE AirPods -249,00 € 4 689,01 €',
      'Nouveau solde 4 689,01 €',
      'Page 1 / 2',
    ]
    const p = parsePdfLines(lines)
    expect(p.suggestedPick).toBe('secondLast')
    expect(p.csv.rows).toEqual([
      ['2026-11-02', 'SCI DUPONT Virement novembre', '-210.00'],
      ['2026-11-03', 'Spotify AB SPOTIFY P1234567', '-12.14'],
      ['2026-11-08', 'FRANCE TRAVAIL ARE', '1300.00'],
      ['2026-11-12', 'APPLE STORE AirPods', '-249.00'],
    ])
    const { transactions } = toTransactions(p.csv, p.roles)
    expect(transactions.map((t) => t.amount)).toEqual([-21000, -1214, 130000, -24900])
  })

  it('relevé sans signe ni solde, avec date de valeur', () => {
    const p = parsePdfLines(['05/11/2026 06/11/2026 CB CARREFOUR CITY 34,56', '07/11/2026 07/11/2026 UBER EATS 23,90'])
    expect(p.suggestedPick).toBe('last')
    expect(p.csv.rows).toEqual([
      ['2026-11-05', 'CB CARREFOUR CITY', '-34.56'],
      ['2026-11-07', 'UBER EATS', '-23.90'],
    ])
    expect(parsePdfLines(['05/11/2026 VIREMENT REÇU 100,00'], { unsigned: 'income' }).csv.rows[0][2]).toBe('100.00')
  })
})
