import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, X } from 'lucide-react'
import { emptyPlan, newId, todayISO } from '../domain/defaults'
import { formatEuros } from '../domain/money'
import { monthOf } from '../domain/month'
import { samplePlan } from '../domain/sample'
import type { Cents, Plan } from '../domain/types'
import { MoneyInput, inputClass } from './inputs'

interface Line {
  id: string
  label: string
  amount: Cents
}

const SUGGESTED_EXPENSES = ['Loyer', 'Électricité', 'Internet', 'Téléphone', 'Courses', 'Transport', 'Assurances', 'Abonnements']

function LineEditor({ lines, setLines, placeholder }: { lines: Line[]; setLines: (l: Line[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_8.5rem_auto] items-center gap-2">
          <input
            className={inputClass}
            value={l.label}
            placeholder={placeholder}
            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <MoneyInput value={l.amount} onChange={(amount) => setLines(lines.map((x, j) => (j === i ? { ...x, amount } : x)))} />
          <button
            type="button"
            aria-label={`Retirer ${l.label || 'cette ligne'}`}
            onClick={() => setLines(lines.filter((_, j) => j !== i))}
            className="grid h-10 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Démarrage guidé : solde, revenus, dépenses fixes, matelas. */
export function Onboarding({ onFinish, onSkip }: { onFinish: (p: Plan) => void; onSkip: (p?: Plan) => void }) {
  const [step, setStep] = useState(0)
  const [balance, setBalance] = useState<Cents>(0)
  const [incomes, setIncomes] = useState<Line[]>([{ id: newId(), label: 'Salaire', amount: 0 }])
  const [expenses, setExpenses] = useState<Line[]>([])
  const [cushion, setCushion] = useState<Cents | null>(null)

  const monthlyOut = expenses.reduce((s, l) => s + l.amount, 0)
  const monthlyIn = incomes.reduce((s, l) => s + l.amount, 0)
  const cushionValue = cushion ?? Math.round(monthlyOut / 100) * 100

  function build(): Plan {
    const p = emptyPlan()
    return {
      ...p,
      startingCapital: { amount: balance, date: todayISO() },
      safetyCushion: cushionValue,
      incomePeriods: incomes
        .filter((l) => l.amount > 0)
        .map((l) => ({ id: l.id, label: l.label || 'Revenu', monthlyAmount: l.amount, startMonth: null, endMonth: null })),
      fixedExpenses: expenses
        .filter((l) => l.amount > 0)
        .map((l) => ({ id: l.id, label: l.label || 'Dépense', monthlyAmount: l.amount, startMonth: null, endMonth: null })),
    }
  }

  const steps = [
    {
      title: 'Bienvenue !',
      body: (
        <div className="space-y-3 text-sm text-muted">
          <p>
            Cette app vous montre <strong className="text-ink">combien vous pouvez dépenser</strong> sans jamais passer sous un minimum de
            sécurité, et <strong className="text-ink">comment votre solde va évoluer</strong> mois après mois.
          </p>
          <p>3 questions rapides pour commencer. Vous pourrez tout modifier ensuite.</p>
        </div>
      ),
    },
    {
      title: 'Combien avez-vous sur vos comptes aujourd’hui ?',
      hint: 'Le total de vos comptes courants, sans compter l’épargne placée (crypto, actions…).',
      body: <MoneyInput value={balance} onChange={setBalance} placeholder="Ex : 2 500" />,
    },
    {
      title: 'Combien gagnez-vous par mois ?',
      hint: 'Salaire, chômage, allocations… Une ligne par revenu.',
      body: (
        <>
          <LineEditor lines={incomes} setLines={setIncomes} placeholder="Salaire" />
          <button
            type="button"
            onClick={() => setIncomes([...incomes, { id: newId(), label: '', amount: 0 }])}
            className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-accent"
          >
            <Plus size={16} /> Ajouter un revenu
          </button>
        </>
      ),
    },
    {
      title: 'Quelles sont vos dépenses chaque mois ?',
      hint: 'Touchez celles qui vous concernent, puis indiquez le montant mensuel.',
      body: (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTED_EXPENSES.filter((n) => !expenses.some((e) => e.label === n)).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setExpenses([...expenses, { id: newId(), label: n, amount: 0 }])}
                className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium ring-1 ring-line hover:bg-accent-soft"
              >
                <Plus size={14} className="text-accent" /> {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setExpenses([...expenses, { id: newId(), label: '', amount: 0 }])}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-accent ring-1 ring-accent/40"
            >
              <Plus size={14} /> Autre
            </button>
          </div>
          <LineEditor lines={expenses} setLines={setExpenses} placeholder="Nom" />
          {monthlyOut > 0 && (
            <p className="mt-3 text-sm text-muted">
              Total : <span className="num font-semibold text-ink">{formatEuros(monthlyOut)}</span> par mois
              {monthlyIn > 0 && (
                <>
                  {' '}
                  · il vous reste <span className={`num font-semibold ${monthlyIn - monthlyOut < 0 ? 'text-neg' : 'text-pos'}`}>{formatEuros(monthlyIn - monthlyOut)}</span>
                </>
              )}
            </p>
          )}
        </>
      ),
    },
    {
      title: 'Quel minimum voulez-vous toujours garder ?',
      hint: 'Votre « matelas de sécurité » pour les imprévus. On conseille souvent 1 à 3 mois de dépenses.',
      body: (
        <>
          <MoneyInput value={cushionValue} onChange={setCushion} />
          {monthlyOut > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3].map((n) => {
                const v = Math.round((monthlyOut * n) / 100) * 100
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCushion(v)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                      cushionValue === v ? 'bg-accent text-white ring-accent dark:text-bg' : 'bg-surface-2 text-accent ring-line'
                    }`}
                  >
                    {n} mois ({formatEuros(v, { round: true })})
                  </button>
                )
              })}
            </div>
          )}
        </>
      ),
    },
  ]
  const last = step === steps.length - 1
  const s = steps[step]

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-3xl bg-surface p-5 shadow-xl shadow-indigo-500/5 ring-1 ring-line sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Étape ${step + 1} sur ${steps.length}`}>
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? 'w-6 bg-accent' : 'w-3 bg-line'}`} />
            ))}
          </div>
          <button type="button" onClick={() => onSkip()} className="text-xs font-semibold text-muted hover:text-ink">
            Passer
          </button>
        </div>
        {step === 0 && (
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white">
            <Sparkles size={22} />
          </span>
        )}
        <h2 className="text-xl font-extrabold tracking-tight">{s.title}</h2>
        {'hint' in s && s.hint && <p className="mt-1 text-sm text-muted">{s.hint}</p>}
        <div className="mt-4">{s.body}</div>

        <div className="mt-6 flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 rounded-full px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface-2"
            >
              <ArrowLeft size={16} /> Retour
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onFinish(build()) : setStep(step + 1))}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/30"
          >
            {step === 0 ? 'Commencer' : last ? 'Voir mes résultats' : 'Suivant'}
            {last ? <Check size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </div>
      {step === 0 && (
        <div className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => onSkip(samplePlan(monthOf(new Date()), todayISO()))}
            className="font-semibold text-accent hover:underline"
          >
            Voir d’abord un exemple
          </button>
        </div>
      )}
    </div>
  )
}
