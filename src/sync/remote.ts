import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Plan } from '../domain/types'
import { SUPABASE_KEY, SUPABASE_URL, remoteEnabled } from './config'

export const supabase: SupabaseClient | null = remoteEnabled ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

export interface RemotePlan {
  plan: Plan
  /** Horodatage serveur de la dernière sauvegarde (sert de numéro de version) */
  version: string
}

export async function fetchRemote(): Promise<RemotePlan | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('plans').select('data, updated_at').maybeSingle()
  if (error) throw error
  return data ? { plan: data.data as Plan, version: data.updated_at as string } : null
}

/** Enregistre le plan en ligne et renvoie la nouvelle version. */
export async function pushRemote(plan: Plan): Promise<string> {
  if (!supabase) throw new Error('Base en ligne non configurée')
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) throw new Error('Non connecté')
  const { data, error } = await supabase
    .from('plans')
    .upsert({ user_id: u.user.id, data: plan })
    .select('updated_at')
    .single()
  if (error) throw error
  return data.updated_at as string
}
