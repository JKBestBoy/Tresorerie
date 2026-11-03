import { useState, type ReactNode } from 'react'
import {
  emptyPlan,
  newFixedExpense,
  newIncomePeriod,
  newOneOffIncome,
  newPlannedExpense,
  touchesStartMonth,
} from '../domain/defaults'
import { formatEuros } from '../domain/money'
import { addMonths, monthLabel, monthOf } from '../domain/month'
import { installmentAmounts, splitInstallments, startMonthOf } from '../domain/projection'
import { samplePlan } from '../domain/sample'
import type { Cents, Plan, PlannedExpense } from '../domain/types'
import { Checkbox, Field, MoneyInput, MonthInput, TextInput, inputClass } from './inputs'

type ListKey = 'incomePeriods' | 'oneOffIncomes' | 'fixedExpenses' | 'plannedExpenses'
type Item<K extends ListKey> = Plan[K][number]

function Section({
  title,
  subtitle,
  total,
  children,
  defaultOpen = true,
}: {
  title: string
  subtitle?: string
  total?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {total}
          <span className="transition group-open:rotate-180">▾</span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">{children}</div>
    </details>
  )
}

function ItemCard({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  return (
    <div className="relative space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      {children}
      <div className="flex justify-end">
        <button type="button" onClick={onDelete} className="text-sm text-red-600 hover:underline">
          Supprimer
        </button>
      </div>
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border-2 border-dashed border-slate-300 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
    >
      + {children}
    </button>
  )
}

function EndBeforeStart({ start, end }: { start: string | null; end: string | null }) {
  if (start && end && end < start)
    return <p className="text-sm text-red-600">La fin est avant le début : ce flux ne sera jamais compté.</p>
  return null
}

export function PlanEditor({ plan, setPlan }: { plan: Plan; setPlan: (u: (p: Plan) => Plan) => void }) {
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
        <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900 ring-1 ring-indigo-200">
          <p className="font-medium">Bienvenue ! Remplissez les blocs ci-dessous, de haut en bas.</p>
          <p className="mt-1">Tout est enregistré automatiquement sur cet appareil, rien n’est envoyé sur internet.</p>
          <button
            type="button"
            className="mt-2 text-indigo-700 underline"
            onClick={() => setPlan(() => samplePlan(monthOf(new Date()), new Date().toISOString().slice(0, 10)))}
          >
            Ou charger un exemple pour découvrir l’app
          </button>
        </div>
      )}

      <Section title="1. Point de départ" subtitle="Ce que vous avez sur votre compte aujourd’hui">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Solde actuel">
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

      <Section
        title="2. Revenus mensuels"
        subtitle="Salaire, allocations… Une ligne par période (ex : 1 200 € jusqu’en juin, puis 1 800 €)"
        total={plan.incomePeriods.length ? `${plan.incomePeriods.length} ligne(s)` : undefined}
      >
        {plan.incomePeriods.map((it) => (
          <ItemCard key={it.id} onDelete={() => remove('incomePeriods', it.id)}>
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
        title="3. Rentrées ponctuelles"
        subtitle="Prime, remboursement, vente…"
        total={plan.oneOffIncomes.length ? `${plan.oneOffIncomes.length} ligne(s)` : undefined}
        defaultOpen={plan.oneOffIncomes.length > 0}
      >
        {plan.oneOffIncomes.map((it) => (
          <ItemCard key={it.id} onDelete={() => remove('oneOffIncomes', it.id)}>
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
        title="4. Dépenses fixes mensuelles"
        subtitle="Loyer, abonnements, courses, transport…"
        total={plan.fixedExpenses.length ? `${formatEuros(fixedTotal, { round: true })}/mois` : undefined}
      >
        {plan.fixedExpenses.map((it) => (
          <ItemCard key={it.id} onDelete={() => remove('fixedExpenses', it.id)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <TextInput value={it.label} placeholder="Loyer" onChange={(label) => update('fixedExpenses', it.id, { label })} />
              </Field>
              <Field label="Montant par mois">
                <MoneyInput value={it.monthlyAmount} onChange={(monthlyAmount) => update('fixedExpenses', it.id, { monthlyAmount })} />
              </Field>
            </div>
            <details className="text-sm" open={!!(it.startMonth || it.endMonth)}>
              <summary className="cursor-pointer text-slate-600">Dates de début / fin (optionnel)</summary>
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
        title="5. Grosses dépenses prévues"
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

      <Section title="6. Matelas de sécurité" subtitle="Le solde en dessous duquel vous ne voulez jamais descendre">
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
              className="rounded-lg bg-red-600 px-3 py-1 text-white"
              onClick={() => {
                setPlan(() => emptyPlan())
                setConfirmReset(false)
              }}
            >
              Oui, effacer
            </button>
            <button type="button" className="text-slate-600 underline" onClick={() => setConfirmReset(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="text-sm text-slate-500 underline" onClick={() => setConfirmReset(true)}>
            Tout effacer et recommencer
          </button>
        )}
      </div>
    </div>
  )
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
  const sum = (a: Cents[]) => a.reduce((s, x) => s + x, 0)

  function setInstallments(n: number) {
    if (custom && n > 1) {
      const next = Array.from({ length: n }, (_, i) => it.customAmounts![i] ?? 0)
      onChange({ installments: n, customAmounts: next, totalAmount: sum(next) })
    } else {
      onChange({ installments: n, customAmounts: undefined })
    }
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
    <ItemCard onDelete={onDelete}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <TextInput value={it.label} placeholder="Vacances" onChange={(label) => onChange({ label })} />
        </Field>
        <Field label="Montant total" hint={custom ? 'Calculé à partir des mensualités ci-dessous' : undefined}>
          {custom ? (
            <div className={`${inputClass} bg-slate-100 text-slate-700`}>{formatEuros(sum(parts))}</div>
          ) : (
            <MoneyInput value={it.totalAmount} onChange={(totalAmount) => onChange({ totalAmount })} />
          )}
        </Field>
        <Field label={it.installments > 1 ? 'Mois du 1er paiement' : 'Mois'}>
          <MonthInput value={it.month} onChange={(m) => m && onChange({ month: m })} />
        </Field>
        <Field
          label="Paiement"
          hint={!custom && it.installments > 1 && it.totalAmount > 0 ? `${parts.length} × ${formatEuros(parts[parts.length - 1])}` : undefined}
        >
          <select className={inputClass} value={it.installments} onChange={(e) => setInstallments(Number(e.target.value))}>
            <option value={1}>Comptant</option>
            {INSTALLMENT_CHOICES.map((n) => (
              <option key={n} value={n}>
                En {n} mensualités
              </option>
            ))}
          </select>
        </Field>
      </div>
      {it.installments > 1 && (
        <Checkbox label="Les mensualités n’ont pas toutes le même montant" checked={custom} onChange={setCustom} />
      )}
      {custom && (
        <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          {parts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_9rem] items-center gap-3">
              <span className="text-sm text-slate-600">
                {i + 1}. {monthLabel(addMonths(it.month, i))}
              </span>
              <MoneyInput value={c} onChange={(v) => setPart(i, v)} />
            </div>
          ))}
        </div>
      )}
      {showSettled && (
        <Checkbox
          label={it.installments > 1 ? `Mensualité de ${startLabel} déjà payée` : 'Déjà payé'}
          checked={!!it.settledInStartMonth}
          onChange={(settledInStartMonth) => onChange({ settledInStartMonth })}
        />
      )}
    </ItemCard>
  )
}
