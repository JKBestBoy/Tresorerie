import { useRegisterSW } from 'virtual:pwa-register/react'
import { Sparkles } from 'lucide-react'

/** Bandeau « nouvelle version disponible » : la mise à jour se fait quand l'utilisateur le décide. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Vérifie s'il y a une nouvelle version toutes les heures quand l'app reste ouverte
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 mx-auto flex max-w-md items-center gap-2 rounded-3xl bg-surface p-2 pl-4 shadow-xl ring-1 ring-accent/30">
      <Sparkles size={16} className="shrink-0 text-accent" />
      <span className="flex-1 text-sm font-semibold">Nouvelle version disponible</span>
      <button type="button" onClick={() => setNeedRefresh(false)} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">
        Plus tard
      </button>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white dark:text-bg"
      >
        Mettre à jour
      </button>
    </div>
  )
}
