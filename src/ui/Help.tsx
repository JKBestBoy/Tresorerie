import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'

/** Petit « ? » : ouvre une fiche d'explication en bas de l'écran. */
export function Help({ title, children, light }: { title: string; children: ReactNode; light?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button
        type="button"
        aria-label={`Aide : ${title}`}
        onClick={(e) => {
          // Dans un titre de bloc dépliable : ne pas ouvrir/fermer le bloc
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={`inline-grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${
          light ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-muted hover:bg-surface-2 hover:text-accent'
        }`}
      >
        <CircleHelp size={16} />
      </button>
      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="w-full max-w-md rounded-3xl bg-surface p-5 text-left text-ink shadow-2xl ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 font-bold">
              <CircleHelp size={18} className="text-accent" /> {title}
            </p>
            <div className="mt-2 space-y-2 text-sm font-normal leading-relaxed text-muted">{children}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white dark:text-bg"
            >
              Compris
            </button>
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}
