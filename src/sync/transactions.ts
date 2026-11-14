import { useCallback, useEffect, useState } from 'react'
import { addMonths } from '../domain/month'
import type { Transaction } from '../domain/statement'
import { loadLocalTransactions, saveLocalTransactions } from '../storage'
import { supabase } from './remote'

interface Row {
  id: string
  date: string
  amount: number
  label: string
  description: string
  category: string | null
  account: string | null
  import_id: string | null
  source: string | null
}

const fromRow = (r: Row): Transaction => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  label: r.label,
  description: r.description,
  ...(r.category ? { category: r.category } : {}),
  ...(r.account ? { account: r.account } : {}),
  ...(r.import_id ? { importId: r.import_id } : {}),
  ...(r.source ? { source: r.source } : {}),
})

/** Opérations importées : en ligne (Supabase) si connecté, sinon sur l'appareil. */
export function useTransactions(online: boolean) {
  const [list, setList] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      if (online && supabase) {
        const all: Transaction[] = []
        // Lecture par pages de 1 000
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from('transactions')
            .select('id, date, amount, label, description, category, account, import_id, source')
            .order('date', { ascending: false })
            .range(from, from + 999)
          if (error) throw error
          all.push(...(data as Row[]).map(fromRow))
          if (!data || data.length < 1000) break
        }
        setList(all)
      } else setList(await loadLocalTransactions())
    } finally {
      setLoading(false)
    }
  }, [online])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  /** Enregistre des opérations (sans vérifier les doublons). */
  const insert = useCallback(
    async (fresh: Transaction[], base: Transaction[]) => {
      if (online && supabase) {
        for (let i = 0; i < fresh.length; i += 500) {
          const chunk = fresh.slice(i, i + 500).map((t) => ({
            id: t.id,
            date: t.date,
            amount: t.amount,
            label: t.label,
            description: t.description,
            category: t.category ?? null,
            account: t.account ?? null,
            import_id: t.importId ?? null,
            source: t.source ?? null,
          }))
          const { error } = await supabase.from('transactions').upsert(chunk, { onConflict: 'user_id,id', ignoreDuplicates: true })
          if (error) throw error
        }
      } else await saveLocalTransactions([...fresh, ...base])
    },
    [online],
  )

  /** Ajoute des opérations ; celles déjà importées (même empreinte) sont ignorées. Renvoie le nombre de nouvelles. */
  const add = useCallback(
    async (txs: Transaction[]): Promise<number> => {
      const known = new Set(list.map((t) => t.id))
      const fresh = txs.filter((t) => !known.has(t.id))
      if (fresh.length === 0) return 0
      await insert(fresh, list)
      await reload()
      return fresh.length
    },
    [list, insert, reload],
  )

  /** Supprime toutes les opérations d'un relevé importé. */
  const removeImport = useCallback(
    async (importId: string) => {
      if (online && supabase) {
        const { error } = await supabase.from('transactions').delete().eq('import_id', importId)
        if (error) throw error
      } else await saveLocalTransactions(list.filter((t) => t.importId !== importId))
      await reload()
    },
    [list, online, reload],
  )

  /**
   * Remplace un relevé par un autre fichier : les opérations de l'ancien sont supprimées, celles du nouveau
   * ajoutées (en gardant le classement déjà fait pour les opérations identiques). Renvoie le nombre importé.
   */
  const replaceImport = useCallback(
    async (importId: string, txs: Transaction[]): Promise<number> => {
      const old = list.filter((t) => t.importId === importId)
      const choices = new Map(old.filter((t) => t.category).map((t) => [t.id, t.category!]))
      const rest = list.filter((t) => t.importId !== importId)
      const known = new Set(rest.map((t) => t.id))
      const fresh = txs.filter((t) => !known.has(t.id)).map((t) => (choices.has(t.id) && !t.category ? { ...t, category: choices.get(t.id) } : t))
      if (online && supabase) {
        const { error } = await supabase.from('transactions').delete().eq('import_id', importId)
        if (error) throw error
      }
      await insert(fresh, rest)
      await reload()
      return fresh.length
    },
    [list, online, insert, reload],
  )

  /** Change la catégorie d'une opération (null = catégorie automatique). */
  const setCategory = useCallback(
    async (id: string, category: string | null) => {
      setList((l) => l.map((t) => (t.id === id ? { ...t, category: category ?? undefined } : t)))
      if (online && supabase) {
        const { error } = await supabase.from('transactions').update({ category }).eq('id', id)
        if (error) throw error
      } else await saveLocalTransactions(list.map((t) => (t.id === id ? { ...t, category: category ?? undefined } : t)))
    },
    [list, online],
  )

  /** Supprime toutes les opérations d'un mois (pour réimporter proprement). */
  const removeMonth = useCallback(
    async (month: string) => {
      if (online && supabase) {
        const { error } = await supabase
          .from('transactions')
          .delete()
          .gte('date', `${month}-01`)
          .lt('date', `${addMonths(month, 1)}-01`)
        if (error) throw error
      } else await saveLocalTransactions(list.filter((t) => !t.date.startsWith(month)))
      await reload()
    },
    [list, online, reload],
  )

  return { transactions: list, loading, add, setCategory, removeMonth, removeImport, replaceImport, reload }
}
