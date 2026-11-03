import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './remote'

export function useAuth() {
  /** undefined = en cours de vérification ; null = non connecté */
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  /** Vrai quand on arrive depuis le lien "mot de passe oublié" */
  const [recovery, setRecovery] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, recovery, endRecovery: () => setRecovery(false) }
}
