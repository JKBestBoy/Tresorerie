import { useEffect, useState } from 'react'
import { clearLocal } from './storage'
import { remoteEnabled } from './sync/config'
import { supabase } from './sync/remote'
import { useAuth } from './sync/useAuth'
import { LoginScreen, NewPasswordScreen } from './ui/LoginScreen'
import { PlanEditor } from './ui/PlanEditor'
import { ResultsView } from './ui/ResultsView'
import { usePlan, type SyncStatus } from './usePlan'

type Tab = 'results' | 'data'

export default function App() {
  const { session, recovery, endRecovery } = useAuth()
  if (session === undefined) return <p className="p-8 text-center text-slate-500">Chargement…</p>
  if (recovery) return <NewPasswordScreen onDone={endRecovery} />
  if (remoteEnabled && !session) return <LoginScreen />
  return <Main key={session?.user.id ?? 'local'} online={!!session} email={session?.user.email ?? null} />
}

function statusLabel(s: SyncStatus, online: boolean): string {
  switch (s) {
    case 'loading':
      return 'Chargement…'
    case 'saving':
      return 'Enregistrement…'
    case 'pending':
      return '⏳ En attente d’envoi'
    case 'error':
      return '⚠️ Erreur d’enregistrement'
    case 'synced':
      return online ? '☁️ Synchronisé' : '✓ Sur cet appareil'
  }
}

function Main({ online, email }: { online: boolean; email: string | null }) {
  const { plan, setPlan, dirty, save, revert, status, message, dismissMessage } = usePlan(online)
  const [tab, setTab] = useState<Tab | null>(null)
  const [menu, setMenu] = useState(false)

  // Au premier lancement (aucune donnée), on ouvre directement la saisie
  useEffect(() => {
    if (plan && tab === null && status !== 'loading') {
      const empty =
        plan.startingCapital.amount === 0 &&
        plan.incomePeriods.length + plan.fixedExpenses.length + plan.plannedExpenses.length + plan.oneOffIncomes.length === 0
      setTab(empty ? 'data' : 'results')
    }
  }, [plan, tab, status])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  async function logout() {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Se déconnecter quand même ?')) return
    await clearLocal()
    await supabase?.auth.signOut()
  }

  return (
    <div className="min-h-dvh pb-40">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-bold">Ma trésorerie</h1>
          <div className="relative flex items-center gap-2">
            <span className={`text-xs ${status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
              {dirty ? '✎ Non enregistré' : statusLabel(status, online)}
            </span>
            {online && (
              <button type="button" className="rounded-lg px-2 py-1 text-lg text-slate-600 hover:bg-slate-100" onClick={() => setMenu((m) => !m)} aria-label="Menu">
                ☰
              </button>
            )}
            {menu && (
              <div className="absolute right-0 top-10 w-60 rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200">
                <p className="truncate text-slate-500">Connecté : {email}</p>
                <button type="button" className="mt-2 w-full rounded-lg bg-slate-100 py-2 font-medium" onClick={logout}>
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {message && (
          <div className="mb-4 flex items-start justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <span>{message}</span>
            <button type="button" onClick={dismissMessage} aria-label="Fermer">
              ✕
            </button>
          </div>
        )}
        {plan && tab === 'data' && <PlanEditor plan={plan} setPlan={setPlan} />}
        {plan && tab === 'results' && (
          <>
            {dirty && (
              <p className="mb-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900 ring-1 ring-indigo-200">
                Les résultats tiennent compte de vos modifications non enregistrées.
              </p>
            )}
            <ResultsView plan={plan} onEdit={() => setTab('data')} />
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgb(226_232_240)]">
        {dirty && (
          <div className="mx-auto flex max-w-3xl items-center gap-2 border-b border-slate-200 bg-amber-50 px-4 py-2">
            <span className="flex-1 text-sm text-amber-900">Modifications non enregistrées</span>
            <button type="button" onClick={revert} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-amber-100">
              Annuler
            </button>
            <button type="button" onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow">
              Enregistrer
            </button>
          </div>
        )}
        <nav className="mx-auto grid max-w-3xl grid-cols-2">
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
        </nav>
      </div>
    </div>
  )
}
