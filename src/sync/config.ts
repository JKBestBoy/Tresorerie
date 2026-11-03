/**
 * Connexion à la base de données en ligne (Supabase).
 * Ces deux valeurs sont publiques par conception : la sécurité repose sur les
 * règles d'accès de la base (chaque utilisateur ne voit que ses propres données).
 * Laisser vide = mode "cet appareil uniquement".
 */
export const SUPABASE_URL: string = 'https://ybbusuobmjipljtefblj.supabase.co'
export const SUPABASE_KEY: string = 'sb_publishable_-9zCOP41rB_YKdjF8YJAKw_Bwn9mHfb'

export const remoteEnabled = SUPABASE_URL !== '' && SUPABASE_KEY !== ''
