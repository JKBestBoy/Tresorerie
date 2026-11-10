import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyPlan } from './domain/defaults'
import type { Plan } from './domain/types'
import { loadLocal, requestPersistence, saveLocal, type LocalRecord } from './storage'
import { fetchRemote, pushRemote } from './sync/remote'

export type SyncStatus =
  | 'loading'
  | 'saving'
  | 'synced' // enregistré (et en ligne si connecté)
  | 'pending' // enregistré sur l'appareil, en attente d'envoi en ligne
  | 'error'

function hasData(p: Plan) {
  return (
    p.startingCapital.amount !== 0 ||
    p.incomePeriods.length + p.oneOffIncomes.length + p.fixedExpenses.length + p.plannedExpenses.length > 0
  )
}

/**
 * Gère le plan : brouillon en cours d'édition + dernière version enregistrée.
 * @param online true si l'utilisateur est connecté à la base en ligne
 */
export function usePlan(online: boolean) {
  const [draft, setDraft] = useState<Plan | null>(null)
  const [saved, setSaved] = useState<LocalRecord | null>(null)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const savedRef = useRef<LocalRecord | null>(null)
  savedRef.current = saved

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved.plan)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const apply = useCallback(async (rec: LocalRecord) => {
    await saveLocal(rec)
    setSaved(rec)
    setDraft(rec.plan)
    setStatus(rec.pendingSync && online ? 'pending' : 'synced')
  }, [online])

  /** Envoie la version locale en ligne. Renvoie false en cas d'échec réseau. */
  const push = useCallback(async (rec: LocalRecord): Promise<boolean> => {
    try {
      const version = await pushRemote(rec.plan)
      const next = { plan: rec.plan, remoteVersion: version, pendingSync: false }
      await saveLocal(next)
      setSaved(next)
      setStatus('synced')
      return true
    } catch {
      setStatus('pending')
      return false
    }
  }, [])

  /** Récupère la version en ligne si elle est plus récente (sans écraser une saisie en cours). */
  const pull = useCallback(async () => {
    if (!online) return
    const local = savedRef.current ?? (await loadLocal())
    let remote
    try {
      remote = await fetchRemote()
    } catch {
      setStatus(local?.pendingSync ? 'pending' : 'synced')
      return
    }
    if (!remote) {
      // Rien en ligne : on envoie les données de cet appareil s'il y en a
      if (local && hasData(local.plan)) await push(local)
      else await apply({ plan: local?.plan ?? emptyPlan(), remoteVersion: null, pendingSync: false })
      return
    }
    if (local?.pendingSync) {
      if (local.remoteVersion === remote.version) {
        await push(local) // personne d'autre n'a modifié : on envoie
      } else {
        const keepLocal = window.confirm(
          'Vos données ont été modifiées sur un autre appareil, et cet appareil a aussi des modifications non envoyées.\n\n' +
            'OK = garder les données de CET appareil\nAnnuler = récupérer celles de l’autre appareil',
        )
        if (keepLocal) await push(local)
        else await apply({ plan: remote.plan, remoteVersion: remote.version, pendingSync: false })
      }
      return
    }
    if (remote.version !== local?.remoteVersion && !dirtyRef.current) {
      await apply({ plan: remote.plan, remoteVersion: remote.version, pendingSync: false })
      if (local) setMessage('Données mises à jour depuis un autre appareil.')
    } else {
      setStatus('synced')
    }
  }, [online, push, apply])

  // Chargement initial
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let local: LocalRecord | null = null
      try {
        local = await loadLocal()
      } catch {
        setStatus('error')
      }
      if (cancelled) return
      const rec = local ?? { plan: emptyPlan(), remoteVersion: null, pendingSync: false }
      setSaved(rec)
      setDraft(rec.plan)
      setStatus(online && rec.pendingSync ? 'pending' : 'synced')
      if (online) await pull()
    })()
    requestPersistence()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Retour sur l'app / retour du réseau : on resynchronise
  useEffect(() => {
    if (!online) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [online, pull])

  // Avertit avant de quitter avec des modifications non enregistrées
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const setPlan = useCallback((updater: Plan | ((p: Plan) => Plan)) => {
    setDraft((prev) => (prev ? (typeof updater === 'function' ? updater(prev) : updater) : prev))
  }, [])

  /** Enregistre le brouillon (ou `override`, qui devient alors le brouillon). */
  const save = useCallback(async (override?: Plan) => {
    const toSave = override ?? draft
    if (!toSave) return
    if (override) setDraft(override)
    setStatus('saving')
    setMessage(null)
    const base = savedRef.current
    const rec: LocalRecord = { plan: toSave, remoteVersion: base?.remoteVersion ?? null, pendingSync: online }
    try {
      await saveLocal(rec)
      setSaved(rec)
    } catch {
      setStatus('error')
      return
    }
    if (!online) {
      setStatus('synced')
      return
    }
    // Vérifie que personne n'a enregistré entre-temps depuis un autre appareil
    try {
      const remote = await fetchRemote()
      if (remote && remote.version !== rec.remoteVersion) {
        const overwrite = window.confirm(
          'Ces données ont été modifiées depuis un autre appareil depuis votre dernière synchronisation.\n\n' +
            'OK = remplacer par ce que vous venez de saisir\nAnnuler = récupérer la version de l’autre appareil (vos modifications seront perdues)',
        )
        if (!overwrite) {
          await apply({ plan: remote.plan, remoteVersion: remote.version, pendingSync: false })
          return
        }
      }
    } catch {
      setStatus('pending')
      setMessage('Hors ligne : enregistré sur cet appareil, envoi automatique dès le retour du réseau.')
      return
    }
    const ok = await push(rec)
    if (!ok) setMessage('Hors ligne : enregistré sur cet appareil, envoi automatique dès le retour du réseau.')
  }, [draft, online, push, apply])

  const revert = useCallback(() => {
    if (savedRef.current) setDraft(savedRef.current.plan)
  }, [])

  /**
   * Petite modification enregistrée tout de suite (ex : pointage). Si d'autres modifications
   * sont en cours, elle rejoint simplement le brouillon et partira avec « Enregistrer ».
   */
  const commit = useCallback(
    (updater: (p: Plan) => Plan) => {
      if (!draft) return
      if (dirtyRef.current) setDraft(updater(draft))
      else save(updater(draft))
    },
    [draft, save],
  )

  // Enregistrement automatique : moins d'une seconde après la dernière modification
  useEffect(() => {
    if (!dirty || status === 'loading') return
    const t = window.setTimeout(() => {
      save()
    }, 900)
    return () => window.clearTimeout(t)
  }, [draft, dirty, status, save])

  return { plan: draft, setPlan, commit, dirty, save, revert, status, message, dismissMessage: () => setMessage(null) }
}
