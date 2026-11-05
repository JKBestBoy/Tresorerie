import { useState } from 'react'
import { Briefcase, CalendarClock, Gift, Home, Landmark, ShieldCheck, Sparkles } from 'lucide-react'
import {
  emptyPlan,
  newFixedExpense,
  newIncomePeriod,
  newOneOffIncome,
  newPlannedExpense,
  touchesStartMonth,
} from '../domain/defaults'
import { formatEuros } from '../domain/money'
import { addMonths, monthLabel, monthOf, monthShortLabel } from '../domain/month'
import { installmentAmounts, installmentSchedule, splitInstallments, startMonthOf } from '../domain/projection'
import { samplePlan } from '../domain/sample'
import type { Quotes } from '../domain/investments'
import type { Cents, Plan, PlannedExpense } from '../domain/types'
import { InvestmentsSection } from './InvestmentsEditor'
import { Checkbox, Field, MoneyInput, MonthInput, TextInput, inputClass } from './inputs'
import { AddButton, ItemCard, Section } from './layout'

type ListKey = 'incomePeriods' | 'oneOffIncomes' | 'fixedExpenses' | 'plannedExpenses'
type Item<K extends ListKey> = Plan[K][number]

function EndBeforeStart({ start, end }: { start: string | null; end: string | null }) {
  if (start && end && end < start)
    return <p className="text-sm text-neg">La fin est avant le début : ce flux ne sera jamais compté.</p>
  return null
}

export function PlanEditor({
  plan,
  setPlan,
  quotes,
}: {
  plan: Plan
  setPlan: (u: (p: Plan) => Plan) => void
  quotes: Quotes
}) {
  const [confirmReset, setConfirmReset] = useState(false)
  const start = startMonthOf(plan)

  function update<K extends ListKey>(key: K, id: string, patch: Partial<Item<K>>) {
    setPlan((p) => ({ ...p, [key]: (p[key] as Item<K>[]).map((it) => (it.id === id ? { ...it, ...patch } : it)) }))
  }
  function remove<K extends ListKey>(key: K, id: string) {
    setPlan((p) => ({ ...p, [key]: (p[key] as Item<K>[]).filter((it) => it.id !== id) }))
  }
  function add<K extends ListKey>(key: K, item: Item<K>) {
    setPlan((p) => ({ ...p, [key]: [...p[key], item] }))
  }

  const isEmpty =
    plan.startingCapital.amount === 0 &&
    plan.incomePeriods.length + plan.oneOffIncomes.length + plan.fixedExpenses.length + plan.plannedExpenses.length === 0

  const fixedTotal = plan.fixedExpenses
    .filter((f) => (f.startMonth === null || f.startMonth <= start) && (f.endMonth === null || f.endMonth >= start))
    .reduce((s, f) => s + f.monthlyAmount, 0)

  return (
    <div className="space-y-4">
      {isEmpty && (
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-5 text-white shadow-lg shadow-indigo-500/20">
          <Sparkles size={22} className="mb-2 opacity-90" />
          <p className="text-lg font-bold">Bienvenue !</p>
          <p className="mt-1 text-sm text-white/85">Remplissez les blocs ci-dessous de haut en bas, puis appuyez sur « Enregistrer ».</p>
          <button
            type="button"
            className="mt-3 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25"
            onClick={() => setPlan(() => samplePlan(monthOf(new Date()), new Date().toISOString().slice(0, 10)))}
          >
            Charger un exemple pour découvrir l’app
          </button>
        </div>
      )}

      <Section icon={Landmark} tone="indigo" title="Liquidités" subtitle="Ce que vous avez aujourd’hui sur vos comptes courants (hors investissements)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Solde de mes comptes">
            <MoneyInput
              value={plan.startingCapital.amount}
              onChange={(amount) => setPlan((p) => ({ ...p, startingCapital: { ...p.startingCapital, amount } }))}
            />
          </Field>
          <Field label="À la date du">
            <input
              type="date"
              className={inputClass}
              value={plan.startingCapital.date}
              onChange={(e) =>
                e.target.value && setPlan((p) => ({ ...p, startingCapital: { ...p.startingCapital, date: e.target.value } }))
              }
            />
          </Field>
        </div>
      </Section>

      <InvestmentsSection plan={plan} quotes={quotes} setPlan={setPlan} />

      <Section
        icon={Briefcase}
        tone="emerald"
        title="Revenus mensuels"
        subtitle="Salaire, allocations… une ligne par période"
        total={plan.incomePeriods.length ? `${plan.incomePeriods.length} ligne(s)` : undefined}
      >
        {plan.incomePeriods.map((it) => (
          <ItemCard
            key={it.id}
            onDelete={() => remove('incomePeriods', it.id)}
            title={it.label}
            detail={periodText(it.startMonth, it.endMonth)}
            amount={`${formatEuros(it.monthlyAmount, { round: it.monthlyAmount % 100 === 0 })}/mois`}
            isNew={!it.label && !it.monthlyAmount}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <TextInput value={it.label} placeholder="Salaire" onChange={(label) => update('incomePeriods', it.id, { label })} />
              </Field>
              <Field label="Montant par mois">
                <MoneyInput value={it.monthlyAmount} onChange={(monthlyAmount) => update('incomePeriods', it.id, { monthlyAmount })} />
              </Field>
              <Field label="À partir de" hint={it.startMonth ? undefined : 'Vide = dès le départ'}>
                <MonthInput optional value={it.startMonth} onChange={(startMonth) => update('incomePeriods', it.id, { startMonth })} />
              </Field>
              <Field label="Jusqu’à (inclus)" hint={it.endMonth ? undefined : 'Vide = sans fin'}>
                <MonthInput optional value={it.endMonth} onChange={(endMonth) => update('incomePeriods', it.id, { endMonth })} />
              </Field>
            </div>
            <EndBeforeStart start={it.startMonth} end={it.endMonth} />
            {touchesStartMonth(plan, it) && (
              <Checkbox
                label={`Déjà reçu en ${monthLabel(start)} (inclus dans le solde)`}
                checked={!!it.settledInStartMonth}
                onChange={(settledInStartMonth) => update('incomePeriods', it.id, { settledInStartMonth })}
              />
            )}
          </ItemCard>
        ))}
        <AddButton onClick={() => add('incomePeriods', newIncomePeriod())}>Ajouter un revenu</AddButton>
      </Section>

      <Section
        icon={Gift}
        tone="sky"
        title="Rentrées ponctuelles"
        subtitle="Prime, remboursement, vente…"
        total={plan.oneOffIncomes.length ? `${plan.oneOffIncomes.length} ligne(s)` : undefined}
      >
        {plan.oneOffIncomes.map((it) => (
          <ItemCard
            key={it.id}
            onDelete={() => remove('oneOffIncomes', it.id)}
            title={it.label}
            detail={monthLabel(it.month)}
            amount={formatEuros(it.amount, { round: it.amount % 100 === 0 })}
            isNew={!it.label && !it.amount}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nom">
                <TextInput value={it.label} placeholder="Prime" onChange={(label) => update('oneOffIncomes', it.id, { label })} />
              </Field>
              <Field label="Montant">
                <MoneyInput value={it.amount} onChange={(amount) => update('oneOffIncomes', it.id, { amount })} />
              </Field>
              <Field label="Mois">
                <MonthInput value={it.month} onChange={(m) => m && update('oneOffIncomes', it.id, { month: m })} />
              </Field>
            </div>
            {touchesStartMonth(plan, it) && (
              <Checkbox
                label={`Déjà reçu (inclus dans le solde)`}
                checked={!!it.settledInStartMonth}
                onChange={(settledInStartMonth) => update('oneOffIncomes', it.id, { settledInStartMonth })}
              />
            )}
          </ItemCard>
        ))}
        <AddButton onClick={() => add('oneOffIncomes', newOneOffIncome(plan))}>Ajouter une rentrée</AddButton>
      </Section>

      <Section
        icon={Home}
        tone="rose"
        title="Dépenses fixes mensuelles"
        subtitle="Loyer, abonnements, courses, transport…"
        total={plan.fixedExpenses.length ? `${formatEuros(fixedTotal, { round: true })}/mois` : undefined}
      >
        {plan.fixedExpenses.map((it) => (
          <ItemCard
            key={it.id}
            onDelete={() => remove('fixedExpenses', it.id)}
            title={it.label}
            detail={it.startMonth || it.endMonth ? periodText(it.startMonth, it.endMonth) : undefined}
            amount={`${formatEuros(it.monthlyAmount, { round: it.monthlyAmount % 100 === 0 })}/mois`}
            isNew={!it.label && !it.monthlyAmount}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <TextInput value={it.label} placeholder="Loyer" onChange={(label) => update('fixedExpenses', it.id, { label })} />
              </Field>
              <Field label="Montant par mois">
                <MoneyInput value={it.monthlyAmount} onChange={(monthlyAmount) => update('fixedExpenses', it.id, { monthlyAmount })} />
              </Field>
            </div>
            <details className="text-sm" open={!!(it.startMonth || it.endMonth)}>
              <summary className="cursor-pointer text-sm font-medium text-accent">Dates de début / fin (optionnel)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="À partir de" hint={it.startMonth ? undefined : 'Vide = dès le départ'}>
                  <MonthInput optional value={it.startMonth} onChange={(startMonth) => update('fixedExpenses', it.id, { startMonth })} />
                </Field>
                <Field label="Jusqu’à (inclus)" hint={it.endMonth ? undefined : 'Vide = sans fin'}>
                  <MonthInput optional value={it.endMonth} onChange={(endMonth) => update('fixedExpenses', it.id, { endMonth })} />
                </Field>
              </div>
            </details>
            <EndBeforeStart start={it.startMonth} end={it.endMonth} />
            {touchesStartMonth(plan, it) && (
              <Checkbox
                label={`Déjà prélevé en ${monthLabel(start)}`}
                checked={!!it.settledInStartMonth}
                onChange={(settledInStartMonth) => update('fixedExpenses', it.id, { settledInStartMonth })}
              />
            )}
          </ItemCard>
        ))}
        <AddButton onClick={() => add('fixedExpenses', newFixedExpense())}>Ajouter une dépense fixe</AddButton>
      </Section>

      <Section
        icon={CalendarClock}
        tone="amber"
        title="Grosses dépenses prévues"
        subtitle="Voiture, vacances, ordinateur… payées comptant ou en plusieurs fois"
        total={plan.plannedExpenses.length ? `${plan.plannedExpenses.length} ligne(s)` : undefined}
      >
        {plan.plannedExpenses.map((it) => (
          <PlannedExpenseCard
            key={it.id}
            item={it}
            showSettled={touchesStartMonth(plan, it)}
            startLabel={monthLabel(start)}
            onChange={(patch) => update('plannedExpenses', it.id, patch)}
            onDelete={() => remove('plannedExpenses', it.id)}
          />
        ))}
        <AddButton onClick={() => add('plannedExpenses', newPlannedExpense(plan))}>Ajouter une grosse dépense</AddButton>
      </Section>

      <Section icon={ShieldCheck} tone="violet" title="Matelas de sécurité" subtitle="Le solde en dessous duquel vous ne voulez jamais descendre">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Solde minimum">
            <MoneyInput value={plan.safetyCushion} onChange={(safetyCushion) => setPlan((p) => ({ ...p, safetyCushion }))} />
          </Field>
          <Field label="Projection sur">
            <select
              className={inputClass}
              value={plan.horizonMonths}
              onChange={(e) => setPlan((p) => ({ ...p, horizonMonths: Number(e.target.value) as 12 | 24 }))}
            >
              <option value={12}>12 mois</option>
              <option value={24}>24 mois</option>
            </select>
          </Field>
        </div>
      </Section>

      <div className="pt-4 text-center">
        {confirmReset ? (
          <div className="space-x-3 text-sm">
            <span>Tout effacer définitivement ?</span>
            <button
              type="button"
              className="rounded-full bg-neg px-4 py-1.5 font-semibold text-white"
              onClick={() => {
                setPlan(() => emptyPlan())
                setConfirmReset(false)
              }}
            >
              Oui, effacer
            </button>
            <button type="button" className="text-muted underline" onClick={() => setConfirmReset(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="text-sm text-muted underline" onClick={() => setConfirmReset(true)}>
            Tout effacer et recommencer
          </button>
        )}
      </div>
    </div>
  )
}

/** "de déc. 2026 à août 2027", "jusqu'en août 2027", "dès déc. 2026" ou "" */
function periodText(start: string | null, end: string | null): string {
  const s = start ? monthShortLabel(start) : null
  const e = end ? monthShortLabel(end) : null
  if (s && e) return `de ${s} à ${e}`
  if (e) return `jusqu’en ${e}`
  if (s) return `dès ${s}`
  return 'tous les mois'
}

const INSTALLMENT_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36, 48]

function PlannedExpenseCard({
  item: it,
  showSettled,
  startLabel,
  onChange,
  onDelete,
}: {
  item: PlannedExpense
  showSettled: boolean
  startLabel: string
  onChange: (patch: Partial<PlannedExpense>) => void
  onDelete: () => void
}) {
  const custom = !!it.customAmounts
  const parts = installmentAmounts(it)
  const schedule = installmentSchedule(it)
  const mode: 'monthly' | 'quarterly' | 'free' = it.customMonths ? 'free' : (it.intervalMonths ?? 1) === 3 ? 'quarterly' : 'monthly'
  const unit = mode === 'monthly' ? 'mensualités' : 'échéances'
  const sum = (a: Cents[]) => a.reduce((s, x) => s + x, 0)
  const earliest = (ms: string[]) => [...ms].sort()[0]

  function setInstallments(n: number) {
    const patch: Partial<PlannedExpense> = { installments: n }
    if (custom && n > 1) {
      const next = Array.from({ length: n }, (_, i) => it.customAmounts![i] ?? 0)
      Object.assign(patch, { customAmounts: next, totalAmount: sum(next) })
    } else {
      patch.customAmounts = undefined
    }
    if (mode === 'free' && n > 1) {
      const months = schedule.map((x) => x.month)
      const next = Array.from({ length: n }, (_, i) => months[i] ?? addMonths(months[months.length - 1], i - months.length + 1))
      patch.customMonths = next
    } else if (n <= 1) {
      patch.customMonths = undefined
    }
    onChange(patch)
  }
  function setMode(m: typeof mode) {
    if (m === 'free') onChange({ customMonths: schedule.map((x) => x.month), intervalMonths: undefined })
    else onChange({ customMonths: undefined, intervalMonths: m === 'quarterly' ? 3 : undefined, month: earliest(schedule.map((x) => x.month)) })
  }
  function setMonthAt(i: number, m: string) {
    const next = schedule.map((x) => x.month)
    next[i] = m
    onChange({ customMonths: next, month: earliest(next) })
  }
  function setCustom(on: boolean) {
    if (on) onChange({ customAmounts: splitInstallments(it.totalAmount, it.installments) })
    else onChange({ customAmounts: undefined, totalAmount: sum(parts) })
  }
  function setPart(i: number, c: Cents) {
    const next = [...parts]
    next[i] = c
    onChange({ customAmounts: next, totalAmount: sum(next) })
  }

  return (
    <ItemCard
      onDelete={onDelete}
      title={it.label}
      detail={
        schedule.length > 1
          ? `En ${schedule.length} fois · ${monthShortLabel(schedule[0].month)} → ${monthShortLabel(schedule[schedule.length - 1].month)}`
          : monthLabel(it.month)
      }
      amount={formatEuros(sum(parts), { round: sum(parts) % 100 === 0 })}
      isNew={!it.label && !it.totalAmount && !it.customAmounts}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <TextInput value={it.label} placeholder="Vacances" onChange={(label) => onChange({ label })} />
        </Field>
        <Field label="Montant total" hint={custom ? `Calculé à partir des ${unit} ci-dessous` : undefined}>
          {custom ? (
            <div className={`${inputClass} num bg-surface-2 font-semibold`}>{formatEuros(sum(parts))}</div>
          ) : (
            <MoneyInput value={it.totalAmount} onChange={(totalAmount) => onChange({ totalAmount })} />
          )}
        </Field>
        {mode !== 'free' && (
          <Field label={it.installments > 1 ? 'Mois du 1er paiement' : 'Mois'}>
            <MonthInput value={it.month} onChange={(m) => m && onChange({ month: m })} />
          </Field>
        )}
        <Field
          label="Paiement">
          <select className={inputClass} value={it.installments} onChange={(e) => setInstallments(Number(e.target.value))}>
            <option value={1}>Comptant</option>
            {INSTALLMENT_CHOICES.map((n) => (
              <option key={n} value={n}>
                En {n} fois
              </option>
            ))}
          </select>
        </Field>
      </div>
      {it.installments > 1 && (
        <Field label="Dates des paiements" group>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['monthly', 'Tous les mois'],
                ['quarterly', 'Tous les 3 mois'],
                ['free', 'Dates libres'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                className={`rounded-xl px-1.5 py-2.5 text-sm font-semibold ring-1 transition ${
                  mode === v ? 'bg-accent text-white ring-accent dark:text-bg' : 'bg-surface text-ink ring-line'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}
      {it.installments > 1 && !custom && mode !== 'free' && it.totalAmount > 0 && (
        <p className="num rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent-ink">
          {schedule.length} × {formatEuros(parts[parts.length - 1])}, de {monthLabel(schedule[0].month)} à {monthLabel(schedule[schedule.length - 1].month)}
        </p>
      )}
      {it.installments > 1 && (
        <Checkbox label={`Les ${unit} n’ont pas toutes le même montant`} checked={custom} onChange={setCustom} />
      )}
      {it.installments > 1 && (custom || mode === 'free') && (
        <div className="space-y-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
          {mode === 'free' && <p className="text-xs text-muted">Choisissez le mois de chaque paiement :</p>}
          {parts.map((c, i) =>
            mode === 'free' ? (
              <div key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                <span className="pt-3 text-sm font-semibold text-muted">{i + 1}.</span>
                <div className={custom ? 'space-y-1.5' : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3'}>
                  <MonthInput value={schedule[i].month} onChange={(m) => m && setMonthAt(i, m)} />
                  {custom ? (
                    <MoneyInput value={c} onChange={(v) => setPart(i, v)} />
                  ) : (
                    <span className="num text-sm font-semibold">{formatEuros(c)}</span>
                  )}
                </div>
              </div>
            ) : (
              <div key={i} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                <span className="text-sm text-muted">
                  {i + 1}. {monthLabel(schedule[i].month)}
                </span>
                <MoneyInput value={c} onChange={(v) => setPart(i, v)} />
              </div>
            ),
          )}
        </div>
      )}
      {showSettled && (
        <Checkbox
          label={it.installments > 1 ? `Échéance de ${startLabel} déjà payée` : 'Déjà payé'}
          checked={!!it.settledInStartMonth}
          onChange={(settledInStartMonth) => onChange({ settledInStartMonth })}
        />
      )}
    </ItemCard>
  )
}
