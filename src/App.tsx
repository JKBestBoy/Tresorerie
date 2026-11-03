import { useMemo } from 'react'
import { cushionReport, freeToSpend } from './domain/analysis'
import { formatEuros } from './domain/money'
import { monthLabel, monthOf, monthShortLabel } from './domain/month'
import { project } from './domain/projection'
import { samplePlan } from './domain/sample'

const currentMonth = monthOf(new Date())
const today = new Date().toISOString().slice(0, 10)

export default function App() {
  const plan = useMemo(() => samplePlan(currentMonth, today), [])
  const rows = useMemo(() => project(plan), [plan])
  const free = freeToSpend(rows, plan.safetyCushion)
  const report = cushionReport(rows, plan.safetyCushion)

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Simulateur de trésorerie</h1>
        <p className="text-sm text-slate-500">
          Étape 1 — moteur de calcul, sur un plan d’exemple (non modifiable pour l’instant).
        </p>
      </header>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-2">Plan d’exemple</h2>
        <ul className="text-sm space-y-1 text-slate-700">
          <li>Capital de départ : {formatEuros(plan.startingCapital.amount)} au {today}</li>
          <li>Matelas de sécurité : {formatEuros(plan.safetyCushion)}</li>
          <li>Revenus : {plan.incomePeriods.map((i) => `${i.label} ${formatEuros(i.monthlyAmount)}/mois`).join(', ')}</li>
          <li>Rentrée ponctuelle : {plan.oneOffIncomes.map((o) => `${o.label} ${formatEuros(o.amount)} en ${monthLabel(o.month)}`).join(', ')}</li>
          <li>Dépenses fixes : {plan.fixedExpenses.map((f) => `${f.label} ${formatEuros(f.monthlyAmount)}`).join(', ')}</li>
          <li>
            Grosses dépenses :{' '}
            {plan.plannedExpenses
              .map((p) => `${p.label} ${formatEuros(p.totalAmount)} en ${monthLabel(p.month)}${p.installments > 1 ? ` (${p.installments}×)` : ''}`)
              .join(', ')}
          </li>
          <li className="text-slate-500">« Déjà passé ce mois-ci » : Salaire et Abonnement salle de sport.</li>
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-sm text-emerald-800">Je peux dépenser librement aujourd’hui</p>
          <p className="text-3xl font-bold text-emerald-900">{formatEuros(free.amount, { round: true })}</p>
          {free.alreadyShort > 0 && (
            <p className="text-sm text-red-700">Il manque déjà {formatEuros(free.alreadyShort)} pour respecter le matelas.</p>
          )}
        </div>
        <div
          className={`rounded-xl p-4 ring-1 ${report.firstBreach ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'}`}
        >
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

      <section className="rounded-xl bg-white shadow-sm overflow-x-auto">
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
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">détail</summary>
                    <ul>
                      {r.details.map((d, i) => (
                        <li key={i} className={d.settled ? 'line-through opacity-60' : ''}>
                          {d.label} : {formatEuros(d.amount)}
                          {d.settled && ' (déjà passé)'}
                        </li>
                      ))}
                    </ul>
                  </details>
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
    </main>
  )
}
