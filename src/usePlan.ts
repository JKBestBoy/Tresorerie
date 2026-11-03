import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyPlan } from './domain/defaults'
import type { Plan } from './domain/types'
import { loadPlan, requestPersistence, savePlan } from './storage'

export type SaveState = 'loading' | 'saved' | 'saving' | 'error'

export function usePlan() {
  const [plan, setPlanState] = useState<Plan | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    loadPlan()
      .then((p) => setPlanState(p ?? emptyPlan()))
      .catch(() => {
        setPlanState(emptyPlan())
        setSaveState('error')
        return
      })
      .finally(() => setSaveState((s) => (s === 'error' ? s : 'saved')))
    requestPersistence()
  }, [])

  const setPlan = useCallback((updater: Plan | ((p: Plan) => Plan)) => {
    setPlanState((prev) => {
      if (!prev) return prev
      const next = typeof updater === 'function' ? updater(prev) : updater
      setSaveState('saving')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        savePlan(next)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, 300)
      return next
    })
  }, [])

  return { plan, setPlan, saveState }
}
