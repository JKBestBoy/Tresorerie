import { useState, type FormEvent } from 'react'
import { supabase } from '../sync/remote'
import { Field, inputClass } from './inputs'

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
      <h1 className="text-2xl font-bold">Ma trésorerie</h1>
      <p className="mb-6 text-sm text-slate-500">Retrouvez vos données sur tous vos appareils.</p>
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold">{titles[mode]}</h2>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white disabled:opacity-50">
          {busy ? '…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer le compte' : 'Envoyer le lien'}
        </button>
        <div className="flex flex-col gap-1 text-center text-sm">
          {mode !== 'login' && (
            <button type="button" className="text-indigo-700 underline" onClick={() => setMode('login')}>
              J’ai déjà un compte
            </button>
          )}
          {mode !== 'signup' && (
            <button type="button" className="text-indigo-700 underline" onClick={() => setMode('signup')}>
              Créer un compte
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="text-slate-500 underline" onClick={() => setMode('reset')}>
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
        className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
        onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase!.auth.updateUser({ password })
          if (error) setError(frenchError(error.message))
          else onDone()
        }}
      >
        <h2 className="font-semibold">Choisissez un nouveau mot de passe</h2>
        <input className={inputClass} type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white">Valider</button>
      </form>
    </div>
  )
}
