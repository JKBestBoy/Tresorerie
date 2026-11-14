import { normalizeText, type Transaction } from './statement'

export interface Category {
  id: string
  label: string
  /** Mots-clés cherchés dans le libellé (sans accents, en minuscules) */
  keywords: string[]
  income?: boolean
}

export const CATEGORIES: Category[] = [
  {
    id: 'courses',
    label: 'Courses',
    keywords: ['carrefour', 'lidl', 'aldi', 'auchan', 'leclerc', 'intermarche', 'monoprix', 'franprix', 'casino', 'picard', 'super u', 'hyper u', 'u express', 'biocoop', 'naturalia', 'grand frais', 'netto', 'g20', 'spar', 'albert heijn', 'jumbo', 'supermarche', 'epicerie', 'boulangerie', 'primeur', 'marche'],
  },
  {
    id: 'restaurants',
    label: 'Restaurants & sorties',
    keywords: ['uber eats', 'ubereats', 'deliveroo', 'just eat', 'mcdonald', 'mc donald', 'burger king', 'kfc', 'subway', 'starbucks', 'restaurant', 'resto', 'brasserie', 'cafe', 'bar ', 'pizza', 'sushi', 'kebab', 'boulangerie paul', 'domino', 'o tacos', 'five guys', 'cinema', 'ugc', 'pathe', 'fnac spectacles', 'ticketmaster'],
  },
  {
    id: 'transport',
    label: 'Transport',
    keywords: ['sncf', 'ratp', 'navigo', 'uber', 'bolt', 'heetch', 'free now', 'blablacar', 'ouigo', 'tgv', 'total', 'totalenergies', 'esso', 'shell', 'bp ', 'avia', 'station', 'peage', 'vinci autoroute', 'sanef', 'aprr', 'parking', 'indigo', 'lime', 'dott', 'velib', 'tier', 'air france', 'easyjet', 'ryanair', 'transavia', 'vueling'],
  },
  {
    id: 'abonnements',
    label: 'Abonnements',
    keywords: ['spotify', 'netflix', 'disney', 'canal+', 'amazon prime', 'prime video', 'deezer', 'apple.com', 'itunes', 'icloud', 'google one', 'youtube', 'adobe', 'microsoft', 'chatgpt', 'openai', 'anthropic', 'claude', 'free mobile', 'free telecom', 'sfr', 'orange', 'bouygues', 'sosh', 'red by sfr', 'basic fit', 'basic-fit', 'fitness park', 'neoness', 'salle de sport'],
  },
  {
    id: 'logement',
    label: 'Logement & énergie',
    keywords: ['loyer', 'edf', 'engie', 'totalenergies electricite', 'ekwateur', 'eau de', 'veolia', 'suez', 'syndic', 'assurance habitation', 'leroy merlin', 'castorama', 'ikea', 'bricorama'],
  },
  {
    id: 'sante',
    label: 'Santé',
    keywords: ['pharmacie', 'pharma', 'docteur', 'dr ', 'medecin', 'dentiste', 'dentaire', 'orthodont', 'kine', 'opticien', 'laboratoire', 'hopital', 'clinique', 'doctolib', 'mutuelle'],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    keywords: ['amazon', 'amzn', 'zalando', 'zara', 'h&m', 'h & m', 'uniqlo', 'primark', 'decathlon', 'fnac', 'darty', 'boulanger', 'apple store', 'sephora', 'nocibe', 'action', 'vinted', 'shein', 'temu', 'aliexpress', 'cdiscount', 'ebay', 'kiabi', 'jd sports', 'foot locker', 'nike', 'adidas'],
  },
  {
    id: 'cash',
    label: 'Retraits',
    keywords: ['retrait', 'withdrawal', 'atm', 'dab', 'distributeur', 'geldautomaat'],
  },
  {
    id: 'frais',
    label: 'Frais bancaires & impôts',
    keywords: ['frais', 'commission', 'cotisation', 'bunq', 'agios', 'impot', 'dgfip', 'tresor public', 'amende', 'urssaf'],
  },
  {
    id: 'virements',
    label: 'Virements & épargne',
    keywords: ['virement', 'transfer', 'overboeking', 'trade republic', 'okx', 'binance', 'coinbase', 'boursorama', 'revolut', 'livret', 'epargne', 'paypal', 'lydia', 'wero'],
  },
  { id: 'revenus', label: 'Revenus', keywords: ['salaire', 'france travail', 'pole emploi', 'caf', 'remboursement', 'ameli', 'cpam', 'refund'], income: true },
  { id: 'autres', label: 'Autres', keywords: [] },
]

export const categoryById = (id: string | undefined) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]


/** Clé d'un commerçant : libellé sans accents, chiffres ni ponctuation (ex. « CARREFOUR CITY 1234 » → « carrefour city »). */
export function merchantKey(label: string): string {
  return normalizeText(label)
    .replace(/[0-9*#/\\._-]+/g, ' ')
    .replace(/\b(cb|carte|paiement|payment|achat|prlv|sepa|vir|card)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ')
}

/** Catégorie d'une opération : règle apprise pour ce commerçant, sinon mots-clés, sinon Autres / Revenus. */
export function categorize(t: Transaction, rules: Record<string, string> = {}): string {
  const key = merchantKey(t.label)
  if (key && rules[key]) return rules[key]
  const text = ` ${normalizeText(`${t.label} ${t.description}`)} `
  for (const c of CATEGORIES) {
    if (c.keywords.some((k) => text.includes(k))) {
      // Un mot-clé de revenu sur une dépense (ex. « remboursement » envoyé) : on laisse dans Autres
      if (c.income && t.amount < 0) continue
      return c.id
    }
  }
  return t.amount > 0 ? 'revenus' : 'autres'
}
