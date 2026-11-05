import { useState } from 'react'
import { CalendarCheck, CheckCircle2, Circle, RefreshCcw } from 'lucide-react'
import { todayISO } from '../domain/defaults'
import { formatEuros } from '../domain/money'
import { monthLabel } from '../domain/month'
import { startMonthOf, toggleSettled } from '../domain/projection'
import type { Cents, MonthKey, MonthRow, Plan } from '../domain/types'
import { MoneyInput } from './inputs'

const signedExact = (c: Cents) => (c > 0 ? '+' : c < 0 ? '−' : '') + formatEuros(Math.abs(c))
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'))

/**
 * Pointage du mois : on coche ce qui est déjà passé sur le compte depuis le dernier
 * solde saisi, pour que l'app ne le compte pas une seconde fois.
 */
export function PointageCard({ plan, row, setPlan }: { plan: Plan; row: MonthRow; setPlan: (u: (p: Plan) => Plan) => void }) {
  const lines = [...row.details].sort((a, b) => Number(b.amount >= 0) - Number(a.amount >= 0))
  if (lines.length === 0) return null
  const pending = lines.filter((l) => !l.settled)
  const pendingIn = pending.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const pendingOut = pending.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0)
  const done = lines.length - pending.length

  return (
    <section className="rounded-3xl bg-surface ring-1 ring-line">
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <CalendarCheck size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-bold">Pointage de {monthLabel(row.month).split(' ')[0]}</h2>
            <span className="num shrink-0 text-xs font-semibold text-muted">
              {done}/{lines.length} passé{done > 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Solde saisi le {shortDate(plan.startingCapital.date)} : <span className="num font-semibold text-ink">{formatEuros(plan.startingCapital.amount)}</span>.
            Cochez ce qui est déjà passé sur votre compte depuis.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-line px-2">
        {lines.map((l) => (
          <li key={l.sourceId + l.label}>
            <button
              type="button"
              onClick={() => setPlan((p) => toggleSettled(p, l.sourceId))}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition hover:bg-surface-2"
              aria-pressed={l.settled}
            >
              {l.settled ? (
                <CheckCircle2 size={20} className="shrink-0 text-pos" />
              ) : (
                <Circle size={20} className="shrink-0 text-line" strokeWidth={2.2} />
              )}
              <span className={`min-w-0 flex-1 truncate ${l.settled ? 'text-muted line-through' : 'font-medium'}`}>{l.label || 'Sans nom'}</span>
              <span
                className={`num shrink-0 font-semibold ${l.settled ? 'text-muted line-through' : l.amount >= 0 ? 'text-pos' : 'text-neg'}`}
              >
                {signedExact(l.amount)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="m-3 mt-1 grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-xs">
        <div>
          <p className="text-muted">Encore à recevoir</p>
          <p className="num mt-0.5 text-[13px] font-semibold text-pos">{signedExact(pendingIn)}</p>
        </div>
        <div>
          <p className="text-muted">Encore à payer</p>
          <p className="num mt-0.5 text-[13px] font-semibold text-neg">{signedExact(pendingOut)}</p>
        </div>
        <div>
          <p className="text-muted">Solde fin de mois</p>
          <p className={`num mt-0.5 text-[13px] font-bold ${row.closing < 0 ? 'text-neg' : ''}`}>{formatEuros(row.closing)}</p>
        </div>
      </div>
    </section>
  )
}

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
