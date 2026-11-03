import { useMemo } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, ChevronDown, PencilLine } from 'lucide-react'
import { cushionReport, freeToSpend } from '../domain/analysis'
import { formatEuros } from '../domain/money'
import { monthLabel, monthOf } from '../domain/month'
import { project } from '../domain/projection'
import type { Cents, MonthRow, Plan } from '../domain/types'

const eur = (c: Cents) => formatEuros(c, { round: true })
const signed = (c: Cents) => (c > 0 ? '+' : c < 0 ? '−' : '') + eur(Math.abs(c))
const signedExact = (c: Cents) => (c > 0 ? '+' : c < 0 ? '−' : '') + formatEuros(Math.abs(c))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function ResultsView({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const rows = useMemo(() => project(plan), [plan])
  const current = monthOf(new Date())
  const free = freeToSpend(rows, plan.safetyCushion, current)
  const report = cushionReport(rows, plan.safetyCushion)
  const thisMonth = rows.find((r) => r.month === current) ?? rows[0]
  const last = rows[rows.length - 1]
  const hasData =
    plan.startingCapital.amount !== 0 ||
    plan.incomePeriods.length + plan.fixedExpenses.length + plan.plannedExpenses.length + plan.oneOffIncomes.length > 0

  if (!hasData) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-line">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <PencilLine size={26} />
        </div>
        <p className="font-semibold">Aucune donnée pour l’instant</p>
        <p className="mt-1 text-sm text-muted">Saisissez votre solde, vos revenus et vos dépenses pour voir votre projection.</p>
        <button type="button" onClick={onEdit} className="mt-5 rounded-full bg-accent px-5 py-2.5 font-semibold text-white dark:text-bg">
          Saisir mes données
        </button>
      </div>
    )
  }

  const freeRounded = Math.floor(free.amount / 100) * 100

  return (
    <div className="space-y-4">
      {/* Carte principale */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-5 text-white shadow-xl shadow-indigo-600/25">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/5" />
        <p className="relative text-sm font-medium text-white/80">Je peux dépenser librement aujourd’hui</p>
        <p className="num relative mt-1 text-[2.75rem] font-extrabold leading-none tracking-tight">{eur(freeRounded)}</p>
        <p className="relative mt-2 text-sm text-white/80">
          sans jamais passer sous mon matelas de <span className="num font-semibold text-white">{eur(plan.safetyCushion)}</span>
        </p>
        {free.alreadyShort > 0 && (
          <p className="relative mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm">
            Il manque déjà <span className="num font-semibold">{formatEuros(free.alreadyShort)}</span> pour respecter le matelas.
          </p>
        )}
        <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 text-sm">
          <div>
            <p className="text-white/70">Solde fin {monthLabel(thisMonth.month).split(' ')[0]}</p>
            <p className="num text-lg font-bold">{eur(thisMonth.closing)}</p>
          </div>
          <div>
            <p className="text-white/70">Solde fin {monthLabel(last.month)}</p>
            <p className="num text-lg font-bold">{eur(last.closing)}</p>
          </div>
        </div>
      </section>

      {/* Alerte matelas */}
      {report.firstBreach ? (
        <section className="flex gap-3 rounded-3xl bg-neg-soft p-4 ring-1 ring-neg/20">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-neg/15 text-neg">
            <AlertTriangle size={20} />
          </span>
          <div className="text-sm">
            <p className="font-bold text-neg">Sous le matelas en {monthLabel(report.firstBreach.month)}</p>
            <p className="mt-0.5">
              Il manquera <span className="num font-semibold">{formatEuros(report.firstBreach.shortfall)}</span>.
            </p>
            {report.worstBreach && report.worstBreach.month !== report.firstBreach.month && (
              <p className="mt-0.5 text-muted">
                Pire mois : {monthLabel(report.worstBreach.month)} (−<span className="num">{formatEuros(report.worstBreach.shortfall)}</span>)
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-3xl bg-pos-soft p-4 ring-1 ring-pos/20">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-pos/15 text-pos">
            <CheckCircle2 size={20} />
          </span>
          <p className="text-sm font-semibold">Votre solde reste au-dessus du matelas sur toute la période.</p>
        </section>
      )}

      {/* Ce mois-ci */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-muted">{cap(monthLabel(thisMonth.month))}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<ArrowDownLeft size={18} />} label="Entrées" value={signed(thisMonth.incomes)} tone="pos" />
          <Stat icon={<ArrowUpRight size={18} />} label="Sorties" value={signed(-thisMonth.outflows)} tone="neg" />
        </div>
      </section>

      {/* Mois par mois */}
      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-sm font-bold text-muted">Mois par mois</h2>
          <p className="text-xs text-muted">Reste = entrées − sorties du mois</p>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <MonthCard key={r.month} row={r} cushion={plan.safetyCushion} isCurrent={r.month === current} />
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'pos' | 'neg' }) {
  const t = tone === 'pos' ? 'bg-pos/12 text-pos' : 'bg-neg/12 text-neg'
  return (
    <div className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${t}`}>{icon}</span>
      <p className="mt-3 text-xs font-medium text-muted">{label}</p>
      <p className="num text-xl font-bold">{value}</p>
    </div>
  )
}

function MonthCard({ row: r, cushion, isCurrent }: { row: MonthRow; cushion: Cents; isCurrent: boolean }) {
  const below = r.closing < cushion
  return (
    <details
      className={`group rounded-3xl bg-surface ring-1 transition ${below ? 'ring-neg/40' : isCurrent ? 'ring-accent/40' : 'ring-line'}`}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="font-bold">{cap(monthLabel(r.month))}</p>
            {isCurrent && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Ce mois-ci</span>}
            {below && <span className="rounded-full bg-neg-soft px-2 py-0.5 text-[11px] font-semibold text-neg">Sous le matelas</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <p className={`num text-lg font-extrabold ${below ? 'text-neg' : ''}`}>{eur(r.closing)}</p>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Mini label="Entrées" value={signed(r.incomes)} cls={r.incomes ? 'text-pos' : 'text-muted'} />
          <Mini label="Sorties" value={signed(-r.outflows)} cls={r.outflows ? 'text-neg' : 'text-muted'} />
          <Mini label="Reste" value={signed(r.net)} cls={r.net < 0 ? 'text-neg' : r.net > 0 ? 'text-pos' : 'text-muted'} strong />
        </div>
        {r.plannedMarkers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.plannedMarkers.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">
                <CalendarClock size={12} /> {m}
              </span>
            ))}
          </div>
        )}
      </summary>
      {r.details.length > 0 && (
        <ul className="mx-4 mb-4 divide-y divide-line rounded-2xl bg-surface-2 px-3 text-sm">
          <li className="flex justify-between py-2 text-muted">
            <span>Solde début de mois</span>
            <span className="num">{eur(r.opening)}</span>
          </li>
          {r.details.map((d, i) => (
            <li key={i} className={`flex justify-between gap-3 py-2 ${d.settled ? 'text-muted line-through' : ''}`}>
              <span className="min-w-0 truncate">
                {d.label || 'Sans nom'}
                {d.settled && <span className="ml-1 no-underline">(déjà passé)</span>}
              </span>
              <span className={`num shrink-0 font-semibold ${d.settled ? '' : d.amount >= 0 ? 'text-pos' : 'text-neg'}`}>
                {signedExact(d.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function Mini({ label, value, cls, strong }: { label: string; value: string; cls: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 py-2">
      <p className="text-muted">{label}</p>
      <p className={`num mt-0.5 text-[13px] ${strong ? 'font-bold' : 'font-semibold'} ${cls}`}>{value}</p>
    </div>
  )
}
