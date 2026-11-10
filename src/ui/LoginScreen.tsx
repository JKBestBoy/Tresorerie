import { useState, type FormEvent } from 'react'
import { supabase } from '../sync/remote'
import { Field, inputClass } from './inputs'
import { Logo } from './Logo'

type Mode = 'login' | 'signup' | 'reset'

function frenchError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.'
  if (/email not confirmed/i.test(msg)) return 'Adresse e-mail pas encore confirmée : cliquez sur le lien reçu par e-mail.'
  if (/already registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail : connectez-vous.'
  if (/at least 6 characters|password should be/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.'
  if (/rate limit/i.test(msg)) return 'Trop de tentatives, réessayez dans quelques minutes.'
  if (/failed to fetch|network/i.test(msg)) return 'Pas de connexion internet.'
  return msg
}

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setInfo(null)
    const redirect = window.location.origin + window.location.pathname
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        if (error) throw error
        if (!data.session) {
          setInfo('Compte créé ! Ouvrez l’e-mail de confirmation et cliquez sur le lien, puis connectez-vous ici.')
          setMode('login')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
        if (error) throw error
        setInfo('Si un compte existe, un e-mail pour choisir un nouveau mot de passe vient d’être envoyé.')
        setMode('login')
      }
    } catch (err) {
      setError(frenchError(err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Connexion',
    signup: 'Créer mon compte',
    reset: 'Mot de passe oublié',
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <Logo className="mb-5 h-16 w-16 rounded-3xl" size={30} />
      <h1 className="text-3xl font-extrabold tracking-tight">Ma trésorerie</h1>
      <p className="mb-7 mt-1 text-muted">Votre solde, vos projets, sans mauvaise surprise.</p>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-5 shadow-xl shadow-indigo-500/5 ring-1 ring-line">
        <h2 className="text-lg font-bold">{titles[mode]}</h2>
        <Field label="E-mail">
          <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== 'reset' && (
          <Field label="Mot de passe" hint={mode === 'signup' ? 'Au moins 6 caractères' : undefined}>
            <input
              className={inputClass}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {mode === 'signup' && (
          <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-ink">Vos données</p>
            <p className="mt-0.5">
              Elles sont privées : dans l’app, personne d’autre que vous ne peut les voir. Elles sont hébergées en Europe (Paris) par Supabase. La
              personne qui administre ce service peut techniquement accéder à la base de données. Vous pouvez supprimer votre compte et toutes vos
              données à tout moment depuis les réglages.
            </p>
          </div>
        )}
        {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
        {info && <p className="rounded-xl bg-pos-soft px-3 py-2 text-sm text-pos">{info}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 py-3 font-bold text-white shadow-md shadow-indigo-500/30 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer le compte' : 'Envoyer le lien'}
        </button>
        <div className="flex flex-col gap-2 pt-1 text-center text-sm">
          {mode !== 'login' && (
            <button type="button" className="font-semibold text-accent" onClick={() => setMode('login')}>
              J’ai déjà un compte
            </button>
          )}
          {mode !== 'signup' && (
            <button type="button" className="font-semibold text-accent" onClick={() => setMode('signup')}>
              Créer un compte
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="text-muted" onClick={() => setMode('reset')}>
              Mot de passe oublié ?
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/** Affiché après avoir cliqué sur le lien "mot de passe oublié" reçu par e-mail. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <form
        className="space-y-4 rounded-3xl bg-surface p-5 shadow-xl ring-1 ring-line"
        onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase!.auth.updateUser({ password })
          if (error) setError(frenchError(error.message))
          else onDone()
        }}
      >
        <h2 className="text-lg font-bold">Choisissez un nouveau mot de passe</h2>
        <input className={inputClass} type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
        <button className="w-full rounded-full bg-accent py-3 font-bold text-white dark:text-bg">Valider</button>
      </form>
    </div>
  )
}
