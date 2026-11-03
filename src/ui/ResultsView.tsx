import { useMemo } from 'react'
import { cushionReport, freeToSpend } from '../domain/analysis'
import { formatEuros } from '../domain/money'
import { monthLabel, monthShortLabel } from '../domain/month'
import { project } from '../domain/projection'
import type { Plan } from '../domain/types'

export function ResultsView({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const rows = useMemo(() => project(plan), [plan])
  const free = freeToSpend(rows, plan.safetyCushion)
  const report = cushionReport(rows, plan.safetyCushion)
  const hasData =
    plan.startingCapital.amount !== 0 ||
    plan.incomePeriods.length + plan.fixedExpenses.length + plan.plannedExpenses.length + plan.oneOffIncomes.length > 0

  if (!hasData) {
    return (
      <div className="rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-slate-700">Aucune donnée pour l’instant.</p>
        <button type="button" onClick={onEdit} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white">
          Saisir mes données
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-sm text-emerald-800">Je peux dépenser librement aujourd’hui</p>
          <p className="text-3xl font-bold text-emerald-900">{formatEuros(Math.floor(free.amount / 100) * 100, { round: true })}</p>
          <p className="text-xs text-emerald-700">sans jamais passer sous mon matelas de {formatEuros(plan.safetyCushion, { round: true })}</p>
          {free.alreadyShort > 0 && (
            <p className="mt-1 text-sm text-red-700">Il manque déjà {formatEuros(free.alreadyShort)} pour respecter le matelas.</p>
          )}
        </div>
        <div className={`rounded-xl p-4 ring-1 ${report.firstBreach ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'}`}>
          {report.firstBreach ? (
            <>
              <p className="font-semibold text-red-800">⚠️ Sous le matelas en {monthLabel(report.firstBreach.month)}</p>
              <p className="text-sm text-red-700">Il manquera {formatEuros(report.firstBreach.shortfall)}.</p>
              {report.worstBreach && report.worstBreach.month !== report.firstBreach.month && (
                <p className="text-sm text-red-700">
                  Pire mois : {monthLabel(report.worstBreach.month)} (−{formatEuros(report.worstBreach.shortfall)})
                </p>
              )}
            </>
          ) : (
            <p className="font-semibold text-slate-700">✅ Le solde reste au-dessus du matelas sur toute la période.</p>
          )}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-2 text-left">Mois</th>
              <th className="p-2 text-right">Début</th>
              <th className="p-2 text-right">Entrées</th>
              <th className="p-2 text-right">Sorties</th>
              <th className="p-2 text-right">Fin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-slate-100 align-top">
                <td className="p-2">
                  <div className="font-medium">{monthShortLabel(r.month)}</div>
                  {r.details.length > 0 && (
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer">détail</summary>
                      <ul>
                        {r.details.map((d, i) => (
                          <li key={i} className={d.settled ? 'line-through opacity-60' : ''}>
                            {d.label || 'Sans nom'} : {formatEuros(d.amount)}
                            {d.settled && ' (déjà passé)'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="p-2 text-right">{formatEuros(r.opening, { round: true })}</td>
                <td className="p-2 text-right text-emerald-700">+{formatEuros(r.incomes, { round: true })}</td>
                <td className="p-2 text-right text-red-700">−{formatEuros(r.outflows, { round: true })}</td>
                <td className={`p-2 text-right font-semibold ${r.closing < plan.safetyCushion ? 'text-red-700' : ''}`}>
                  {formatEuros(r.closing, { round: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
