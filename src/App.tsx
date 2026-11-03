import { useEffect, useState } from 'react'
import { PlanEditor } from './ui/PlanEditor'
import { ResultsView } from './ui/ResultsView'
import { usePlan, type SaveState } from './usePlan'

type Tab = 'results' | 'data'

const saveLabels: Record<SaveState, string> = {
  loading: 'Chargement…',
  saving: 'Enregistrement…',
  saved: '✓ Enregistré sur cet appareil',
  error: '⚠️ Impossible d’enregistrer (navigation privée ?)',
}

export default function App() {
  const { plan, setPlan, saveState } = usePlan()
  const [tab, setTab] = useState<Tab | null>(null)

  // Au premier lancement (aucune donnée), on ouvre directement la saisie
  useEffect(() => {
    if (plan && tab === null) {
      const empty =
        plan.startingCapital.amount === 0 &&
        plan.incomePeriods.length + plan.fixedExpenses.length + plan.plannedExpenses.length + plan.oneOffIncomes.length === 0
      setTab(empty ? 'data' : 'results')
    }
  }, [plan, tab])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">Ma trésorerie</h1>
          <span className={`text-xs ${saveState === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{saveLabels[saveState]}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {plan && tab === 'data' && <PlanEditor plan={plan} setPlan={setPlan} />}
        {plan && tab === 'results' && <ResultsView plan={plan} onEdit={() => setTab('data')} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-2">
          {(
            [
              ['results', '📊', 'Résultats'],
              ['data', '✏️', 'Mes données'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex flex-col items-center py-2 text-xs font-medium ${tab === key ? 'text-indigo-700' : 'text-slate-500'}`}
            >
              <span className="text-xl">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
