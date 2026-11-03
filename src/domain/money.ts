import type { Cents } from './types'

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const eurRound = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function formatEuros(cents: Cents, opts: { round?: boolean } = {}): string {
  return (opts.round ? eurRound : eur).format(cents / 100)
}

/** Convertit une saisie utilisateur ("1 200,50", "1200.5", "1200 €") en centimes. null si invalide. */
export function parseEuros(input: string): Cents | null {
  const cleaned = input.replace(/[\s\u00a0\u202f\u20ac]/g, '').replace(',', '.')
  if (cleaned === '' || !/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}

export function eurosToCents(euros: number): Cents {
  return Math.round(euros * 100)
}
