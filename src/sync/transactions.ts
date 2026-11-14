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
}

const fromRow = (r: Row): Transaction => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  label: r.label,
  description: r.description,
  ...(r.category ? { category: r.category } : {}),
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
            .select('id, date, amount, label, description, category')
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

  /** Ajoute des opérations ; celles déjà importées (même empreinte) sont ignorées. Renvoie le nombre de nouvelles. */
  const add = useCallback(
    async (txs: Transaction[]): Promise<number> => {
      const known = new Set(list.map((t) => t.id))
      const fresh = txs.filter((t) => !known.has(t.id))
      if (fresh.length === 0) return 0
      if (online && supabase) {
        for (let i = 0; i < fresh.length; i += 500) {
          const chunk = fresh.slice(i, i + 500).map((t) => ({
            id: t.id,
            date: t.date,
            amount: t.amount,
            label: t.label,
            description: t.description,
            category: t.category ?? null,
          }))
          const { error } = await supabase.from('transactions').upsert(chunk, { onConflict: 'user_id,id', ignoreDuplicates: true })
          if (error) throw error
        }
      } else await saveLocalTransactions([...fresh, ...list])
      await reload()
      return fresh.length
    },
    [list, online, reload],
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

  return { transactions: list, loading, add, setCategory, removeMonth, reload }
}
