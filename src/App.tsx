import { useEffect, useRef, useState } from 'react'
import { BarChart3, Cloud, CloudOff, LogOut, Monitor, Moon, PencilLine, Settings2, Sun, TriangleAlert, X, History as HistoryIcon } from 'lucide-react'
import { clearLocal } from './storage'
import { remoteEnabled } from './sync/config'
import { supabase } from './sync/remote'
import { useAuth } from './sync/useAuth'
import { LoginScreen, NewPasswordScreen } from './ui/LoginScreen'
import { Logo } from './ui/Logo'
import { UpdateBanner } from './ui/UpdateBanner'
import { PlanEditor } from './ui/PlanEditor'
import { ResultsView } from './ui/ResultsView'
import { HistoryView } from './ui/HistoryView'
import { Onboarding } from './ui/Onboarding'
import { useTheme, type ThemeChoice } from './ui/theme'
import { usePlan, type SyncStatus } from './usePlan'
import { useQuotes } from './sync/quotes'

type Tab = 'results' | 'data' | 'history'

export default function App() {
  return (
    <>
      <UpdateBanner />
      <Screens />
    </>
  )
}

function Screens() {
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
  if (dirty || status === 'saving') {
    text = 'Enregistrement…'
  } else if (status === 'loading') {
    text = 'Chargement…'
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
  ['history', HistoryIcon, 'Historique'],
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
  const { plan, setPlan, commit, dirty, status, message, dismissMessage } = usePlan(online)
  const live = useQuotes(plan?.investments)
  const [tab, setTab] = useState<Tab | null>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isEmpty =
    !!plan &&
    plan.startingCapital.amount === 0 &&
    plan.incomePeriods.length + plan.fixedExpenses.length + plan.plannedExpenses.length + plan.oneOffIncomes.length === 0 &&
    (plan.investments?.length ?? 0) === 0
  // Premier lancement (aucune donnée) : démarrage guidé, sauf si on l'a passé
  const [skipOnboarding, setSkipOnboarding] = useState(false)
  const onboarding = isEmpty && !skipOnboarding && status !== 'loading'

  useEffect(() => {
    if (plan && tab === null && status !== 'loading') {
      setTab(isEmpty ? 'data' : 'results')
    }
  }, [plan, tab, status, isEmpty])

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
    if (dirty && !window.confirm('Des modifications ne sont pas encore enregistrées. Se déconnecter quand même ?')) return
    await clearLocal()
    await supabase?.auth.signOut()
  }

  async function deleteAccount() {
    const typed = window.prompt(
      'Supprimer définitivement votre compte et toutes vos données (plan, historique, investissements) ?\n\nCette action est irréversible. Tapez SUPPRIMER pour confirmer.',
    )
    if (typed?.trim().toUpperCase() !== 'SUPPRIMER') return
    const { error } = (await supabase?.functions.invoke('delete-account', { body: {} })) ?? { error: null }
    if (error) {
      window.alert('La suppression a échoué (connexion ?). Réessayez dans un instant.')
      return
    }
    await clearLocal()
    await supabase?.auth.signOut()
    window.alert('Votre compte et vos données ont été supprimés.')
  }

  return (
    <div className="min-h-dvh pb-44 lg:pb-28">
      <header className="sticky top-0 z-20 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3 lg:max-w-7xl lg:px-8">
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
                {plan && (
                  <>
                    <p className="mt-4 px-1 pb-2 text-xs font-semibold text-muted">Durée de projection</p>
                    <select
                      className="w-full rounded-2xl border border-line bg-surface-2 px-3 py-2 text-sm"
                      value={plan.horizonMonths}
                      onChange={(e) =>
                        commit((p) => ({ ...p, horizonMonths: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 12 | 24) }))
                      }
                    >
                      <option value="auto">Auto (dernière grosse dépense)</option>
                      <option value={12}>12 mois</option>
                      <option value={24}>24 mois</option>
                    </select>
                  </>
                )}
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
                    <button type="button" className="mt-2 w-full py-1.5 text-xs font-semibold text-neg hover:underline" onClick={deleteAccount}>
                      Supprimer mon compte
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-2 lg:max-w-7xl lg:px-8 lg:pt-4">
        {message && (
          <div className="mb-4 flex items-start justify-between gap-2 rounded-2xl bg-warn-soft p-3 text-sm text-warn ring-1 ring-warn/20">
            <span>{message}</span>
            <button type="button" onClick={dismissMessage} aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        )}
        {onboarding && (
          <Onboarding
            onFinish={(p) => {
              setPlan(() => p)
              setSkipOnboarding(true)
              setTab('results')
            }}
            onSkip={(sample) => {
              if (sample) setPlan(() => sample)
              setSkipOnboarding(true)
              setTab(sample ? 'results' : 'data')
            }}
          />
        )}
        {!onboarding && plan && tab === 'history' && <HistoryView plan={plan} />}
        {!onboarding && plan && tab === 'data' && <PlanEditor plan={plan} setPlan={setPlan} quotes={live.quotes} />}
        {!onboarding && plan && tab === 'results' && (
          <ResultsView plan={plan} onEdit={() => setTab('data')} live={live} setPlan={commit} />
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md space-y-2">
          <nav className={`${onboarding ? 'hidden' : 'grid'} grid-cols-3 gap-1 rounded-[1.75rem] bg-surface/90 p-1.5 shadow-xl ring-1 ring-line backdrop-blur-xl lg:hidden`}>
            {TABS.map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-3xl py-1.5 text-[11px] font-semibold transition ${
                  tab === key ? 'bg-accent text-white shadow-md dark:text-bg' : 'text-muted'
                }`}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
