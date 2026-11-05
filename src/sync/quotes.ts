import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Investment } from '../domain/types'
import { quoteKey, type Quotes } from '../domain/investments'
import { supabase } from './remote'

const CACHE_KEY = 'quotes-cache'
const REFRESH_MS = 60_000

function readCache(): Quotes {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Quotes
  } catch {
    return {}
  }
}

export interface SearchResult {
  id: string
  label: string
  detail: string
}

/** Recherche une crypto (CoinGecko) ou un titre (Yahoo : nom, ISIN, code). */
export async function searchAssets(kind: 'crypto' | 'security', q: string): Promise<SearchResult[]> {
  if (!supabase) return []
  const { data, error } = await supabase.functions.invoke('quotes', { body: { search: { kind, q } } })
  if (error) throw error
  return (data?.results ?? []) as SearchResult[]
}

/**
 * Cours en direct des investissements : chargés au démarrage, puis toutes les minutes
 * tant que l'app est visible. Les derniers cours connus sont gardés sur l'appareil.
 */
export function useQuotes(investments: Investment[] | undefined) {
  const [quotes, setQuotes] = useState<Quotes>(readCache)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const keys = useMemo(
    () => [...new Set((investments ?? []).map(quoteKey).filter((k): k is string => k !== null))].sort(),
    [investments],
  )
  const keysSig = keys.join('|')
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase || keys.length === 0 || busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const body = {
        securities: keys.filter((k) => k.startsWith('yahoo:')).map((k) => k.slice(6)),
        cryptos: keys.filter((k) => k.startsWith('coingecko:')).map((k) => k.slice(10)),
      }
      const { data, error } = await supabase.functions.invoke('quotes', { body })
      if (error) throw error
      setQuotes((prev) => {
        const next = { ...prev, ...(data.prices as Quotes) }
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next))
        } catch {
          /* cache indisponible */
        }
        return next
      })
      setFetchedAt(new Date())
      setFailed(Object.keys(data.errors ?? {}).length > 0)
    } catch {
      setFailed(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig])

  useEffect(() => {
    refresh()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { quotes, fetchedAt, loading, failed, refresh }
}
