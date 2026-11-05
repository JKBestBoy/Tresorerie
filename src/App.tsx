import { useEffect, useRef, useState } from 'react'
import { BarChart3, Cloud, CloudOff, LogOut, Monitor, Moon, PencilLine, Settings2, Sun, TriangleAlert, X } from 'lucide-react'
import { clearLocal } from './storage'
import { remoteEnabled } from './sync/config'
import { supabase } from './sync/remote'
import { useAuth } from './sync/useAuth'
import { LoginScreen, NewPasswordScreen } from './ui/LoginScreen'
import { Logo } from './ui/Logo'
import { PlanEditor } from './ui/PlanEditor'
import { ResultsView } from './ui/ResultsView'
import { useTheme, type ThemeChoice } from './ui/theme'
import { usePlan, type SyncStatus } from './usePlan'
import { useQuotes } from './sync/quotes'

type Tab = 'results' | 'data'

export default function App() {
  const theme = useTheme()
  const { session, recovery, endRecovery } = useAuth()
  if (session === undefined) return <Splash />
  if (recovery) return <NewPasswordScreen onDone={endRecovery} />
  if (remoteEnabled && !session) return <LoginScreen />
  return <Main key={session?.user.id ?? 'local'} online={!!session} email={session?.user.email ?? null} theme={theme} />
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Logo className="h-14 w-14 animate-pulse" size={26} />
    </div>
  )
}

function StatusPill({ status, dirty, online }: { status: SyncStatus; dirty: boolean; online: boolean }) {
  let icon = online ? <Cloud size={13} /> : <CloudOff size={13} />
  let text = online ? 'Synchronisé' : 'Sur cet appareil'
  let cls = 'bg-surface-2 text-muted'
  if (dirty) {
    icon = <PencilLine size={13} />
    text = 'Non enregistré'
    cls = 'bg-warn-soft text-warn'
  } else if (status === 'loading' || status === 'saving') {
    text = status === 'loading' ? 'Chargement…' : 'Enregistrement…'
  } else if (status === 'pending') {
    icon = <CloudOff size={13} />
    text = 'En attente d’envoi'
    cls = 'bg-warn-soft text-warn'
  } else if (status === 'error') {
    icon = <TriangleAlert size={13} />
    text = 'Erreur'
    cls = 'bg-neg-soft text-neg'
  }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{icon}{text}</span>
}

const TABS = [
  ['results', BarChart3, 'Résultats'],
  ['data', PencilLine, 'Mes données'],
] as const

const THEMES: [ThemeChoice, string, typeof Sun][] = [
  ['light', 'Clair', Sun],
  ['dark', 'Sombre', Moon],
  ['auto', 'Auto', Monitor],
]

function Main({
  online,
  email,
  theme: [themeChoice, setTheme],
}: {
  online: boolean
  email: string | null
  theme: ReturnType<typeof useTheme>
}) {
  const { plan, setPlan, dirty, save, revert, status, message, dismissMessage } = usePlan(online)
  const live = useQuotes(plan?.investments)
  const [tab, setTab] = useState<Tab | null>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // Ferme le menu en touchant ailleurs
  useEffect(() => {
    if (!menu) return
    const h = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [menu])

  async function logout() {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Se déconnecter quand même ?')) return
    await clearLocal()
    await supabase?.auth.signOut()
  }

  return (
    <div className="min-h-dvh pb-44 lg:pb-28">
      <header className="sticky top-0 z-20 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3 lg:max-w-6xl lg:px-8">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <h1 className="text-[17px] font-extrabold leading-tight tracking-tight">Ma trésorerie</h1>
              <StatusPill status={status} dirty={dirty} online={online} />
            </div>
          </div>
          {/* Onglets dans l'en-tête sur grand écran */}
          <nav className="hidden gap-1 rounded-full bg-surface p-1.5 ring-1 ring-line lg:flex">
            {TABS.map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
                  tab === key ? 'bg-accent text-white shadow-md dark:text-bg' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-2xl bg-surface text-muted ring-1 ring-line"
              onClick={() => setMenu((m) => !m)}
              aria-label="Réglages"
            >
              <Settings2 size={19} />
            </button>
            {menu && (
              <div className="absolute right-0 top-12 w-64 rounded-3xl bg-surface p-3 shadow-2xl ring-1 ring-line">
                <p className="px-1 pb-2 text-xs font-semibold text-muted">Apparence</p>
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
                  {THEMES.map(([v, label, Icon]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTheme(v)}
                      className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-semibold transition ${
                        themeChoice === v ? 'bg-surface text-accent shadow-sm' : 'text-muted'
                      }`}
                    >
                      <Icon size={17} />
                      {label}
                    </button>
                  ))}
                </div>
                {online && (
                  <>
                    <p className="mt-4 truncate px-1 text-xs text-muted">Connecté : {email}</p>
                    <button
                      type="button"
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 py-2.5 text-sm font-semibold"
                      onClick={logout}
                    >
                      <LogOut size={16} /> Se déconnecter
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-2 lg:max-w-6xl lg:px-8 lg:pt-4">
        {message && (
          <div className="mb-4 flex items-start justify-between gap-2 rounded-2xl bg-warn-soft p-3 text-sm text-warn ring-1 ring-warn/20">
            <span>{message}</span>
            <button type="button" onClick={dismissMessage} aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        )}
        {plan && tab === 'data' && <PlanEditor plan={plan} setPlan={setPlan} quotes={live.quotes} />}
        {plan && tab === 'results' && (
          <>
            {dirty && (
              <p className="mb-4 rounded-2xl bg-accent-soft p-3 text-sm text-accent-ink">
                Les résultats tiennent compte de vos modifications non enregistrées.
              </p>
            )}
            <ResultsView plan={plan} onEdit={() => setTab('data')} live={live} />
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md space-y-2">
          {dirty && (
            <div className="flex items-center gap-2 rounded-3xl bg-surface p-2 pl-4 shadow-xl ring-1 ring-line">
              <span className="flex-1 text-sm font-semibold">Modifications non enregistrées</span>
              <button type="button" onClick={revert} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/30"
              >
                Enregistrer
              </button>
            </div>
          )}
          <nav className="grid grid-cols-2 gap-1 rounded-full bg-surface/90 p-1.5 shadow-xl ring-1 ring-line backdrop-blur-xl lg:hidden">
            {TABS.map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition ${
                  tab === key ? 'bg-accent text-white shadow-md dark:text-bg' : 'text-muted'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
