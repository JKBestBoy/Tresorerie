import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, Circle, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, ChevronDown, PencilLine, RefreshCw, TrendingUp, Pencil } from 'lucide-react'
import { investmentsSummary } from '../domain/investments'
import type { useQuotes } from '../sync/quotes'
import { NewMonthCard } from './Pointage'
import { Help } from './Help'
import { BalanceChart } from './BalanceChart'
import { MoneyInput } from './inputs'
import { setActual, setOpening, startMonthOf, toggleSettled } from '../domain/projection'
import { cushionReport, freeToSpend } from '../domain/analysis'
import { formatEuros } from '../domain/money'
import { monthLabel, monthOf } from '../domain/month'
import { project } from '../domain/projection'
import type { Cents, MonthRow, Plan } from '../domain/types'

const eur = (c: Cents) => formatEuros(c, { round: true })
const signed = (c: Cents) => (c > 0 ? '+' : c < 0 ? '−' : '') + eur(Math.abs(c))
const signedExact = (c: Cents) => (c > 0 ? '+' : c < 0 ? '−' : '') + formatEuros(Math.abs(c))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function ResultsView({
  plan,
  onEdit,
  live,
  setPlan,
}: {
  plan: Plan
  onEdit: () => void
  live: ReturnType<typeof useQuotes>
  setPlan: (u: (p: Plan) => Plan) => void
}) {
  const rows = useMemo(() => project(plan), [plan])
  const current = monthOf(new Date())
  const inv = investmentsSummary(plan, live.quotes)
  // « Je peux dépenser », matelas et découvert : calculés sur les liquidités uniquement.
  // Les placements sont affichés à part (on ne compte pas les vendre pour dépenser).
  const free = freeToSpend(rows, plan.safetyCushion, current)
  const report = cushionReport(rows, plan.safetyCushion)
  const overdraft = cushionReport(rows, 0)
  const thisMonth = rows.find((r) => r.month === current) ?? rows[0]
  // Pointage : tous les mois de la projection sont cochables (paiement en avance compris)
  const start = startMonthOf(plan)
  const toggle = (month: string, id: string) => setPlan((p) => toggleSettled(p, month, id))
  const setAmount = (month: string, id: string, amount: Cents | null) => setPlan((p) => setActual(p, month, id, amount))
  const setOpeningOf = (month: string, amount: Cents | null) => setPlan((p) => setOpening(p, month, amount))
  const last = rows[rows.length - 1]
  const hasData =
    plan.startingCapital.amount !== 0 ||
    plan.incomePeriods.length + plan.fixedExpenses.length + plan.plannedExpenses.length + plan.oneOffIncomes.length > 0 ||
    (plan.investments?.length ?? 0) > 0

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
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
      {/* Carte principale */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-5 text-white shadow-xl shadow-indigo-600/25">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/5" />
        <p className="relative flex items-center gap-1 text-sm font-medium text-white/80">
          Je peux dépenser librement aujourd’hui
          <Help title="Je peux dépenser librement" light>
            <p>Le montant que vous pouvez dépenser aujourd’hui sans que votre solde ne passe jamais sous votre matelas, en tenant compte de tout ce qui est prévu jusqu’à la fin de la période (revenus, dépenses fixes, grosses dépenses).</p>
            <p>Seules vos liquidités comptent : vos placements sont affichés à part.</p>
          </Help>
        </p>
        <p className="num relative mt-1 text-[2.75rem] font-extrabold leading-none tracking-tight">{eur(freeRounded)}</p>
        <p className="relative mt-2 text-sm text-white/80">
          sur mes liquidités, sans jamais passer sous mon matelas de{' '}
          <span className="num font-semibold text-white">{eur(plan.safetyCushion)}</span>
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

      {/* Alerte découvert : le compte passe sous 0 € */}
      {overdraft.firstBreach && (
        <section className="flex gap-3 rounded-3xl bg-neg-soft p-4 ring-1 ring-neg/25">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-neg/15 text-neg">
            <AlertTriangle size={20} />
          </span>
          <div className="text-sm">
            <p className="font-bold text-neg">Découvert en {monthLabel(overdraft.firstBreach.month)}</p>
            <p className="mt-0.5">
              Votre compte passera à <span className="num font-semibold">−{formatEuros(overdraft.firstBreach.shortfall)}</span>.
            </p>
            {overdraft.worstBreach && (
              <p className="mt-0.5 text-muted">
                Pour ne jamais être à découvert, il faut faire entrer au moins{' '}
                <span className="num font-semibold text-ink">{formatEuros(overdraft.worstBreach.shortfall)}</span> avant{' '}
                {monthLabel(overdraft.firstBreach.month)}
                {overdraft.worstBreach.month !== overdraft.firstBreach.month && <> (pire mois : {monthLabel(overdraft.worstBreach.month)})</>}.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Alerte matelas */}
      {report.firstBreach ? (
        <section className="flex gap-3 rounded-3xl bg-warn-soft p-4 ring-1 ring-warn/25">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn">
            <AlertTriangle size={20} />
          </span>
          <div className="text-sm">
            <p className="font-bold text-warn">Sous le matelas en {monthLabel(report.firstBreach.month)}</p>
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
          <p className="text-sm font-semibold">Vos liquidités restent au-dessus du matelas sur toute la période.</p>
        </section>
      )}

      {current > startMonthOf(plan) && (
        <NewMonthCard key={current} plan={plan} current={current} suggested={thisMonth.opening} setPlan={setPlan} />
      )}

      {inv.lines.length > 0 && <InvestmentsCard summary={inv} cash={thisMonth.opening} live={live} />}

      {/* Ce mois-ci */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-muted">{cap(monthLabel(thisMonth.month))}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<ArrowDownLeft size={18} />} label="Entrées" value={signed(thisMonth.incomes)} tone="pos" />
          <Stat icon={<ArrowUpRight size={18} />} label="Sorties" value={signed(-thisMonth.outflows)} tone="neg" />
        </div>
      </section>

      </div>

      <div className="space-y-4">
      {/* Mois par mois */}
      <section>
        <h2 className="mb-2 flex items-center gap-1 px-1 text-sm font-bold text-muted">
          Mois par mois
          <Help title="Mois par mois">
            <p>Pour chaque mois : ce qui rentre, ce qui sort, ce qu’il reste, et votre solde en fin de mois. Touchez un mois pour voir le détail.</p>
            <p>
              <strong className="text-ink">Cochez le rond</strong> d’une ligne quand elle est passée sur votre compte : l’app ne la compte plus, puisqu’elle est déjà dans votre solde.
            </p>
            <p>
              <strong className="text-ink">Touchez un montant</strong> (✎) pour indiquer le vrai montant de ce mois-là, par exemple des courses moins chères que prévu. Le « solde début de mois » se corrige de la même façon.
            </p>
          </Help>
        </h2>
        <p className="mb-2 px-1 text-xs text-muted">
          ◯ Cochez ce qui est passé sur votre compte depuis votre solde du{' '}
          {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(plan.startingCapital.date + 'T12:00:00'))} · ✎ touchez un montant
          pour le corriger.
        </p>
        {/* Téléphone : une carte par mois */}
        <div className="space-y-2.5 lg:hidden">
          {rows.map((r) => (
            <MonthCard
              key={r.month}
              row={r}
              cushion={plan.safetyCushion}
              isCurrent={r.month === current}
              openAtStart={r.month === start}
              onToggle={(id) => toggle(r.month, id)}
              onAmount={(id, a) => setAmount(r.month, id, a)}
              onOpening={(a) => setOpeningOf(r.month, a)}
            />
          ))}
        </div>
        {/* Grand écran : tableau compact */}
        <MonthTable rows={rows} cushion={plan.safetyCushion} current={current} openAtStart={start} onToggle={toggle} onAmount={setAmount} onOpening={setOpeningOf} />
      </section>

      <BalanceChart rows={rows} cushion={plan.safetyCushion} />
      </div>
    </div>
  )
}

function timeAgo(d: Date | null): string {
  if (!d) return 'cours en cache'
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'à l’instant'
  return `il y a ${Math.round(s / 60)} min`
}

function InvestmentsCard({
  summary,
  cash,
  live,
}: {
  summary: ReturnType<typeof investmentsSummary>
  cash: Cents
  live: ReturnType<typeof useQuotes>
}) {
  const changePct = summary.total - summary.change > 0 ? (summary.change / (summary.total - summary.change)) * 100 : 0
  const up = summary.change >= 0
  return (
    <section className="rounded-3xl bg-surface ring-1 ring-line">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-pos/12 text-pos">
              <TrendingUp size={20} />
            </span>
            <div>
              <p className="text-xs font-medium text-muted">Investissements · en direct</p>
              <p className="num text-2xl font-extrabold leading-tight">{eur(summary.total)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => live.refresh()}
            className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-muted"
            aria-label="Actualiser les cours"
          >
            <RefreshCw size={12} className={live.loading ? 'animate-spin' : ''} />
            {live.failed && !live.loading ? 'Hors ligne' : timeAgo(live.fetchedAt)}
          </button>
        </div>
        {summary.change !== 0 && (
          <p className={`num mt-2 text-sm font-semibold ${up ? 'text-pos' : 'text-neg'}`}>
            {up ? '▲' : '▼'} {signed(summary.change)} ({up ? '+' : ''}
            {changePct.toFixed(2).replace('.', ',')} %) aujourd’hui
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-muted">Liquidités</p>
            <p className="num mt-0.5 text-[13px] font-semibold">{eur(cash)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-muted">Patrimoine total</p>
            <p className="num mt-0.5 text-[13px] font-bold">{eur(cash + summary.total)}</p>
          </div>
        </div>
      </div>
      <details className="group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-muted">
          Détail des {summary.lines.length} lignes
          <ChevronDown size={16} className="transition group-open:rotate-180" />
        </summary>
        <ul className="divide-y divide-line px-4 pb-2">
          {[...summary.lines]
            .sort((a, b) => b.value - a.value)
            .map(({ inv, value, changePct: pct, source }) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{inv.label || inv.symbol || 'Sans nom'}</p>
                  <p className="truncate text-xs text-muted">
                    {[inv.account, inv.kind !== 'fixed' ? `${String(inv.quantity).replace('.', ',')} × ${inv.symbol}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                    {source === 'manual' && inv.kind !== 'fixed' && ' · cours indisponible'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num font-bold">{eur(value)}</p>
                  {pct !== null && (
                    <p className={`num text-xs font-semibold ${pct >= 0 ? 'text-pos' : 'text-neg'}`}>
                      {pct >= 0 ? '+' : ''}
                      {pct.toFixed(2).replace('.', ',')} %
                    </p>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </details>
    </section>
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

/** Lignes du détail d'un mois ; cochables (pointage) pour le mois en cours. */
/**
 * Une ligne du détail d'un mois : le rond coche/décoche (déjà passé sur le compte),
 * le montant se touche pour saisir le montant réel de ce mois-là.
 */
function DetailLine({
  d,
  onToggle,
  onAmount,
}: {
  d: MonthRow['details'][number]
  onToggle: (id: string) => void
  onAmount: (id: string, amount: Cents | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<Cents>(Math.abs(d.amount))
  const changed = d.planned !== undefined
  const color = d.settled ? 'text-muted' : d.amount >= 0 ? 'text-pos' : 'text-neg'

  if (editing) {
    const done = (amount: Cents | null) => {
      onAmount(d.sourceId, amount)
      setEditing(false)
    }
    return (
      <div className="space-y-2 rounded-xl bg-surface p-2.5 ring-1 ring-accent/30">
        <p className="text-xs font-semibold text-muted">
          Montant réel de « {d.label || 'Sans nom'} » ce mois-ci
          {changed && <> (prévu : {formatEuros(Math.abs(d.planned!))})</>}
        </p>
        <div
          className="flex gap-2"
          onKeyDown={(e) => {
            if (e.key === 'Enter') done(value)
            if (e.key === 'Escape') setEditing(false)
          }}
        >
          <div className="min-w-0 flex-1">
            <MoneyInput value={value} onChange={setValue} />
          </div>
          <button type="button" onClick={() => done(value)} className="shrink-0 rounded-xl bg-accent px-3.5 text-sm font-semibold text-white dark:text-bg">
            OK
          </button>
        </div>
        <div className="flex justify-between text-xs">
          <button type="button" onClick={() => setEditing(false)} className="font-semibold text-muted">
            Annuler
          </button>
          {changed && (
            <button type="button" onClick={() => done(null)} className="font-semibold text-accent">
              Remettre le montant prévu
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-2 flex items-center gap-1 rounded-lg px-1 transition hover:bg-surface">
      <button
        type="button"
        aria-pressed={d.settled}
        aria-label={`${d.settled ? 'Décocher' : 'Cocher'} ${d.label}`}
        onClick={() => onToggle(d.sourceId)}
        className="flex min-w-0 flex-1 items-center gap-3 py-1.5 pl-1 text-left"
      >
        {d.settled ? (
          <CheckCircle2 size={19} className="shrink-0 text-pos" />
        ) : (
          <Circle size={19} className="shrink-0 text-muted/50" strokeWidth={2.2} />
        )}
        <span className={`min-w-0 flex-1 truncate ${d.settled ? 'text-muted line-through' : ''}`}>{d.label || 'Sans nom'}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(Math.abs(d.amount))
          setEditing(true)
        }}
        title="Modifier le montant de ce mois"
        className="num flex shrink-0 flex-col items-end rounded-md px-1.5 py-1 hover:bg-surface-2"
      >
        <span className="flex items-center gap-1">
          <span className={`font-semibold ${color} ${d.settled ? 'line-through' : ''} ${changed ? 'underline decoration-dotted underline-offset-4' : ''}`}>
            {signedExact(d.amount)}
          </span>
          <Pencil size={11} className="shrink-0 text-muted/60" aria-hidden />
        </span>
        {changed && <span className="text-[10px] leading-tight text-muted">prévu {formatEuros(Math.abs(d.planned!))}</span>}
      </button>
    </div>
  )
}

/** « Solde début de mois », modifiable : solde réel constaté au début du mois. */
function OpeningLine({ row: r, isStart, onOpening }: { row: MonthRow; isStart: boolean; onOpening: (amount: Cents | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<Cents>(r.opening)
  const changed = r.plannedOpening !== undefined

  if (editing) {
    const done = (amount: Cents | null) => {
      onOpening(amount)
      setEditing(false)
    }
    return (
      <div className="my-1.5 space-y-2 rounded-xl bg-surface p-2.5 ring-1 ring-accent/30">
        <p className="text-xs font-semibold text-muted">
          {isStart ? 'Solde de vos comptes (solde de départ)' : 'Solde réel de vos comptes au début du mois'}
          {changed && <> (calculé : {formatEuros(r.plannedOpening!)})</>}
        </p>
        <div
          className="flex gap-2"
          onKeyDown={(e) => {
            if (e.key === 'Enter') done(value)
            if (e.key === 'Escape') setEditing(false)
          }}
        >
          <div className="min-w-0 flex-1">
            <MoneyInput value={value} onChange={setValue} />
          </div>
          <button type="button" onClick={() => done(value)} className="shrink-0 rounded-xl bg-accent px-3.5 text-sm font-semibold text-white dark:text-bg">
            OK
          </button>
        </div>
        <div className="flex justify-between text-xs">
          <button type="button" onClick={() => setEditing(false)} className="font-semibold text-muted">
            Annuler
          </button>
          {changed && (
            <button type="button" onClick={() => done(null)} className="font-semibold text-accent">
              Revenir au solde calculé
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(r.opening)
        setEditing(true)
      }}
      title="Modifier le solde de début de mois"
      className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-muted transition hover:bg-surface"
    >
      <span>Solde début de mois</span>
      <span className="num flex flex-col items-end">
        <span className="flex items-center gap-1">
          <span className={`font-semibold ${changed ? 'text-ink underline decoration-dotted underline-offset-4' : ''} ${r.opening < 0 ? 'text-neg' : ''}`}>
            {formatEuros(r.opening)}
          </span>
          <Pencil size={11} className="shrink-0 text-muted/60" aria-hidden />
        </span>
        {changed && <span className="text-[10px] leading-tight">calculé {formatEuros(r.plannedOpening!)}</span>}
      </span>
    </button>
  )
}

function settledCount(r: MonthRow) {
  return `${r.details.filter((d) => d.settled).length}/${r.details.length} ✓`
}

function MonthCard({
  row: r,
  cushion,
  isCurrent,
  openAtStart,
  onToggle,
  onAmount,
  onOpening,
}: {
  row: MonthRow
  cushion: Cents
  isCurrent: boolean
  openAtStart: boolean
  onToggle: (id: string) => void
  onAmount: (id: string, amount: Cents | null) => void
  onOpening: (amount: Cents | null) => void
}) {
  const [initiallyOpen] = useState(openAtStart)
  const overdrawn = r.closing < 0
  const below = !overdrawn && r.closing < cushion
  return (
    <details
      open={initiallyOpen || undefined}
      className={`group rounded-3xl bg-surface ring-1 transition ${
        overdrawn ? 'ring-neg/50' : below ? 'ring-warn/40' : isCurrent ? 'ring-accent/40' : 'ring-line'
      }`}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="font-bold">{cap(monthLabel(r.month))}</p>
            {isCurrent && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Ce mois-ci</span>}
            {r.details.some((d) => d.settled) && <span className="num text-[11px] font-semibold text-muted">{settledCount(r)}</span>}
            {overdrawn && <span className="rounded-full bg-neg-soft px-2 py-0.5 text-[11px] font-semibold text-neg">Découvert</span>}
            {below && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Sous le matelas</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <p className={`num text-lg font-extrabold ${overdrawn ? 'text-neg' : below ? 'text-warn' : ''}`}>{eur(r.closing)}</p>
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
          <li>
            <OpeningLine row={r} isStart={openAtStart} onOpening={onOpening} />
          </li>
          {r.details.map((d, i) => (
            <li key={i} className="py-0.5">
              <DetailLine d={d} onToggle={onToggle} onAmount={onAmount} />
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function MonthTable({
  rows,
  cushion,
  current,
  openAtStart,
  onToggle,
  onAmount,
  onOpening,
}: {
  rows: MonthRow[]
  cushion: Cents
  current: string
  openAtStart: string
  onToggle: (month: string, id: string) => void
  onAmount: (month: string, id: string, amount: Cents | null) => void
  onOpening: (month: string, amount: Cents | null) => void
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([openAtStart]))
  const toggle = (m: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  const amountCls = (c: Cents) => (c > 0 ? 'text-pos' : c < 0 ? 'text-neg' : 'text-muted')
  return (
    <div className="hidden overflow-hidden rounded-3xl bg-surface ring-1 ring-line lg:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-muted">
            <th className="py-3 pl-5 pr-2">Mois</th>
            <th className="px-2 py-3 text-right">Entrées</th>
            <th className="px-2 py-3 text-right">Sorties</th>
            <th className="px-2 py-3 text-right">Reste</th>
            <th className="px-2 py-3 text-right">Solde fin</th>
            <th className="w-10 py-3 pr-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const overdrawn = r.closing < 0
            const below = !overdrawn && r.closing < cushion
            const isOpen = open.has(r.month)
            return (
              <Fragment key={r.month}>
                <tr
                  onClick={() => toggle(r.month)}
                  className={`cursor-pointer border-b border-line/70 transition hover:bg-surface-2 ${
                    r.month === current ? 'bg-accent-soft/50' : ''
                  }`}
                >
                  <td className="py-2.5 pl-5 pr-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{cap(monthLabel(r.month))}</span>
                      {r.details.some((d) => d.settled) && <span className="num text-[11px] font-semibold text-muted">{settledCount(r)}</span>}
                      {overdrawn && <span className="rounded-full bg-neg-soft px-2 py-0.5 text-[11px] font-semibold text-neg">Découvert</span>}
                      {below && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Sous le matelas</span>}
                      {r.plannedMarkers.map((m, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
                          <CalendarClock size={11} /> {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`num px-2 py-2.5 text-right font-medium ${amountCls(r.incomes)}`}>{signed(r.incomes)}</td>
                  <td className={`num px-2 py-2.5 text-right font-medium ${amountCls(-r.outflows)}`}>{signed(-r.outflows)}</td>
                  <td className={`num px-2 py-2.5 text-right font-bold ${amountCls(r.net)}`}>{signed(r.net)}</td>
                  <td className={`num px-2 py-2.5 text-right text-base font-extrabold ${overdrawn ? 'text-neg' : below ? 'text-warn' : ''}`}>
                    {eur(r.closing)}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <ChevronDown size={16} className={`inline text-muted transition ${isOpen ? 'rotate-180' : ''}`} />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line/70 bg-surface-2/60">
                    <td colSpan={6} className="px-5 py-3">
                      <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        <li className="-my-0.5">
                          <OpeningLine row={r} isStart={r.month === openAtStart} onOpening={(a) => onOpening(r.month, a)} />
                        </li>
                        {r.details.map((d, i) => (
                          <li key={i}>
                            <DetailLine d={d} onToggle={(id) => onToggle(r.month, id)} onAmount={(id, a) => onAmount(r.month, id, a)} />
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
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
