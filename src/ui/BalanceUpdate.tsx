import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Wallet } from 'lucide-react'
import { todayISO } from '../domain/defaults'
import { formatEuros } from '../domain/money'
import { withNewBalance } from '../domain/projection'
import type { Cents, Plan } from '../domain/types'
import { MoneyInput } from './inputs'

const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'))

/**
 * « Sur mes comptes : X € » dans la carte principale, modifiable en un geste.
 * Le nouveau solde est daté d'aujourd'hui ; les lignes déjà cochées restent cochées
 * (elles étaient déjà passées, donc déjà comprises dans ce nouveau solde).
 */
export function BalanceUpdate({ plan, setPlan }: { plan: Plan; setPlan: (u: (p: Plan) => Plan) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<Cents>(plan.startingCapital.amount)
  const isToday = plan.startingCapital.date === todayISO()

  function submit() {
    setPlan((p) => withNewBalance(p, value, todayISO()))
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(plan.startingCapital.amount)
          setOpen(true)
        }}
        className="relative mt-4 flex w-full items-center gap-3 rounded-2xl bg-white/15 px-3.5 py-2.5 text-left transition hover:bg-white/20"
      >
        <Wallet size={18} className="shrink-0 text-white/80" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-white/75">Sur mes comptes {isToday ? 'aujourd’hui' : `au ${day(plan.startingCapital.date)}`}</span>
          <span className="num block text-lg font-bold leading-tight">{formatEuros(plan.startingCapital.amount)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-indigo-700">
          <Pencil size={12} /> Mettre à jour
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Mettre à jour mon solde"
          >
            <div className="w-full max-w-md rounded-3xl bg-surface p-5 text-left text-ink shadow-2xl ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
              <p className="font-bold">Combien avez-vous sur vos comptes aujourd’hui ?</p>
              <p className="mt-1 text-sm text-muted">Le total de vos comptes courants, tel que vous le voyez dans votre app bancaire. Hors placements.</p>
              <div
                className="mt-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                  if (e.key === 'Escape') setOpen(false)
                }}
              >
                <MoneyInput value={value} onChange={setValue} />
              </div>
              <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-ink">
                Ensuite, dans « Mois par mois », cochez ce qui est <strong>déjà passé</strong> sur votre compte ce mois-ci : c’est déjà compris dans ce
                solde, l’app ne le comptera plus.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-full py-2.5 text-sm font-semibold text-muted hover:bg-surface-2">
                  Annuler
                </button>
                <button type="button" onClick={submit} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-white dark:text-bg">
                  Mettre à jour
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
