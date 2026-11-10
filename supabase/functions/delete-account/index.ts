// Supprime le compte de l'utilisateur connecté et toutes ses données (plan, sauvegardes).
// Le jeton est vérifié par Supabase ; l'identité vient du jeton, jamais du corps de la requête.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return json({ error: 'Connexion requise' }, 401)
  const id = data.user.id
  // Sauvegardes (pas de clé étrangère) puis compte : le plan est supprimé en cascade
  const backup = await admin.from('plans_backup').delete().eq('user_id', id)
  if (backup.error) return json({ error: backup.error.message }, 500)
  const del = await admin.auth.admin.deleteUser(id)
  if (del.error) return json({ error: del.error.message }, 500)
  return json({ deleted: true })
})
