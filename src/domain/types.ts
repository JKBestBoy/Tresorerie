/** Mois au format "AAAA-MM" (ex : "2026-11"). Comparable directement en tant que chaîne. */
export type MonthKey = string
/** Montant en centimes d'euro (entier). 120000 = 1 200,00 €. */
export type Cents = number

/**
 * Commun à tous les flux : si coché, le flux tombant dans le MOIS DE DÉPART est
 * considéré comme déjà passé (donc déjà inclus dans le capital de départ) et
 * n'est pas recompté. Sans effet sur les autres mois.
 */
interface Settleable {
  settledInStartMonth?: boolean
}

export interface IncomePeriod extends Settleable {
  id: string
  label: string
  monthlyAmount: Cents
  /** null = depuis toujours (actif dès le mois de départ) */
  startMonth: MonthKey | null
  /** null = sans fin */
  endMonth: MonthKey | null
}

export interface OneOffIncome extends Settleable {
  id: string
  label: string
  amount: Cents
  month: MonthKey
}

export interface FixedExpense extends Settleable {
  id: string
  label: string
  monthlyAmount: Cents
  startMonth: MonthKey | null
  endMonth: MonthKey | null
}

export interface PlannedExpense extends Settleable {
  id: string
  label: string
  totalAmount: Cents
  /** Mois du premier paiement */
  month: MonthKey
  /** 1 = comptant, N = payé en N fois */
  installments: number
  /** Écart entre deux échéances en mois : 1 = mensuel (défaut), 3 = trimestriel */
  intervalMonths?: number
  /**
   * Montant exact de chaque échéance, si elles ne sont pas égales.
   * Absent = découpage automatique de totalAmount en parts égales.
   */
  customAmounts?: Cents[]
}

export interface Plan {
  schemaVersion: 1
  startingCapital: { amount: Cents; date: string } // date ISO "2026-11-03"
  safetyCushion: Cents
  horizonMonths: 12 | 24
  incomePeriods: IncomePeriod[]
  oneOffIncomes: OneOffIncome[]
  fixedExpenses: FixedExpense[]
  plannedExpenses: PlannedExpense[]
}

export type FlowKind = 'income' | 'oneOffIncome' | 'fixedExpense' | 'plannedExpense'

export interface FlowLine {
  sourceId: string
  kind: FlowKind
  label: string
  /** Signé : positif = entrée, négatif = sortie */
  amount: Cents
  /** Flux du mois de départ marqué "déjà passé" : affiché mais non compté */
  settled: boolean
}

export interface MonthRow {
  month: MonthKey
  opening: Cents
  incomes: Cents
  outflows: Cents // positif
  /** Reste du mois = entrées - sorties (peut être négatif) */
  net: Cents
  closing: Cents
  details: FlowLine[]
  /** Libellés des grosses dépenses dont une échéance tombe ce mois-ci */
  plannedMarkers: string[]
}
