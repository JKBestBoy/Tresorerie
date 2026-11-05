import { useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { todayISO } from '../domain/defaults'
import { formatEuros } from '../domain/money'
import { monthLabel } from '../domain/month'
import { startMonthOf } from '../domain/projection'
import type { Cents, MonthKey, Plan } from '../domain/types'
import { MoneyInput } from './inputs'

/** Affiché quand un nouveau mois a commencé depuis le dernier solde saisi. */
export function NewMonthCard({
  plan,
  current,
  suggested,
  setPlan,
}: {
  plan: Plan
  current: MonthKey
  suggested: Cents
  setPlan: (u: (p: Plan) => Plan) => void
}) {
  const [amount, setAmount] = useState<Cents>(Math.max(0, suggested))
  return (
    <section className="rounded-3xl bg-accent-soft p-4 ring-1 ring-accent/25">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-white dark:text-bg">
          <RefreshCcw size={19} />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold text-accent-ink">Nouveau mois : {monthLabel(current)}</p>
          <p className="mt-0.5 text-accent-ink/80">
            Votre dernier solde date de {monthLabel(startMonthOf(plan))}. Quel est le solde de vos comptes aujourd’hui ?
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <MoneyInput value={amount} onChange={setAmount} />
        </div>
        <button
          type="button"
          onClick={() =>
            setPlan((p) => ({ ...p, startingCapital: { amount, date: todayISO() }, settled: { month: current, ids: [] } }))
          }
          className="shrink-0 rounded-xl bg-accent px-4 font-semibold text-white dark:text-bg"
        >
          Mettre à jour
        </button>
      </div>
      <p className="mt-2 text-xs text-accent-ink/70">
        Prérempli avec le solde prévu par l’app ({formatEuros(suggested)}). Corrigez-le avec le vrai montant, puis pointez ce qui est déjà passé.
      </p>
    </section>
  )
}
