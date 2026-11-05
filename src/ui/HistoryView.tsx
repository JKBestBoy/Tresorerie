import { CheckCircle2, ChevronDown, Circle, History as HistoryIcon, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { balanceChecks, itemAverages } from '../domain/history'
import { formatEuros } from '../domain/money'
import { monthLabel } from '../domain/month'
import type { Cents, HistoryMonth, Plan } from '../domain/types'

const eur = (c: Cents) => formatEuros(c, { round: true })
const exact = (c: Cents) => formatEuros(c)
const signedExact = (c: Cents) => (c > 0 ? '+' : c < 0 ? '−' : '') + formatEuros(Math.abs(c))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'))

export function HistoryView({ plan }: { plan: Plan }) {
  const history = plan.history ?? []

  if (history.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-line">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <HistoryIcon size={26} />
        </div>
        <p className="font-semibold">Votre historique commence le mois prochain</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Au changement de mois, l’app vous demande votre nouveau solde : le mois écoulé est alors archivé ici, avec vos montants
          réels, ce que vous avez pointé et l’écart entre le solde prévu et le vrai.
        </p>
      </div>
    )
  }

  const averages = itemAverages(history)
  const differing = averages.filter((a) => a.gap !== 0)
  const checks = balanceChecks(history)

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        {/* Moyennes réelles */}
        <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="font-bold">Mes vraies moyennes</h2>
          <p className="mt-0.5 text-xs text-muted">
            Sur {history.length} mois archivé{history.length > 1 ? 's' : ''}, d’après les montants réels que vous avez saisis.
          </p>
          {differing.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-pos-soft px-3 py-2.5 text-sm">Vos montants réels correspondent à ce qui était prévu.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {differing.map((a) => {
                // Pour une dépense, moins que prévu = bonne nouvelle ; pour un revenu, plus que prévu
                const good = a.kind === 'income' ? a.gap > 0 : a.gap < 0
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{a.label || 'Sans nom'}</p>
                      <p className="text-xs text-muted">
                        prévu {exact(a.planned)} · {a.months} mois
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num font-bold">{exact(a.average)}<span className="text-xs font-medium text-muted"> /mois</span></p>
                      <p className={`num flex items-center justify-end gap-1 text-xs font-semibold ${good ? 'text-pos' : 'text-neg'}`}>
                        {a.gap > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {signedExact(a.gap)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {differing.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Astuce : si un écart se confirme, ajustez le montant prévu dans « Mes données » pour une projection plus juste.
            </p>
          )}
        </section>

        {/* Solde prévu vs réel */}
        {checks.length > 0 && (
          <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
            <div className="flex items-center gap-2">
              <Scale size={18} className="text-accent" />
              <h2 className="font-bold">Solde prévu ou réel</h2>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {checks.map((c) => (
                <li key={c.month} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">Fin {monthLabel(c.month)}</p>
                    <p className={`num font-bold ${c.gap >= 0 ? 'text-pos' : 'text-neg'}`}>{signedExact(c.gap)}</p>
                  </div>
                  <p className="text-xs text-muted">
                    Prévu {exact(c.expected)} · réel {exact(c.real)} (saisi le {day(c.date)})
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Mois archivés */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-muted">Mois archivés</h2>
        <div className="space-y-2.5">
          {[...history].reverse().map((h, i) => (
            <ArchivedMonth key={h.month} h={h} openAtStart={i === 0} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ArchivedMonth({ h, openAtStart }: { h: HistoryMonth; openAtStart: boolean }) {
  const corrected = h.lines.filter((l) => l.amount !== l.planned).length
  return (
    <details open={openAtStart || undefined} className="group rounded-3xl bg-surface ring-1 ring-line">
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="font-bold">{cap(monthLabel(h.month))}</p>
            {corrected > 0 && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                {corrected} montant{corrected > 1 ? 's' : ''} réel{corrected > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className={`num text-lg font-extrabold ${h.closing < 0 ? 'text-neg' : ''}`}>{eur(h.closing)}</p>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted">
          <span>
            Entrées <span className="num font-semibold text-pos">{signedExact(h.incomes)}</span>
          </span>
          <span>
            Sorties <span className="num font-semibold text-neg">{signedExact(-h.outflows)}</span>
          </span>
          {h.realBalance && (
            <span>
              Réel <span className="num font-semibold text-ink">{eur(h.realBalance.amount)}</span>
            </span>
          )}
        </div>
      </summary>
      <ul className="mx-4 mb-4 divide-y divide-line rounded-2xl bg-surface-2 px-3 text-sm">
        <li className="flex justify-between py-2 text-muted">
          <span>Solde début de mois</span>
          <span className="num">{exact(h.opening)}</span>
        </li>
        {h.lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 py-2">
            {l.paid ? <CheckCircle2 size={17} className="shrink-0 text-pos" /> : <Circle size={17} className="shrink-0 text-muted/50" />}
            <span className="min-w-0 flex-1 truncate">{l.label || 'Sans nom'}</span>
            <span className="num shrink-0 text-right">
              <span className={`block font-semibold ${l.amount >= 0 ? 'text-pos' : 'text-neg'}`}>{signedExact(l.amount)}</span>
              {l.amount !== l.planned && <span className="block text-[10px] text-muted">prévu {exact(Math.abs(l.planned))}</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
