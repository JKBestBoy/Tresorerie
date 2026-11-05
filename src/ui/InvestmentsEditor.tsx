import { useEffect, useState } from 'react'
import { Bitcoin, Coins, LineChart, Loader2, Search, TrendingUp } from 'lucide-react'
import { newInvestment } from '../domain/defaults'
import { valueOf, type Quotes } from '../domain/investments'
import { formatEuros } from '../domain/money'
import type { Investment, Plan } from '../domain/types'
import { searchAssets, type SearchResult } from '../sync/quotes'
import { Field, MoneyInput, TextInput, inputClass } from './inputs'
import { AddButton, ItemCard, Section } from './layout'

const KINDS: [Investment['kind'], string, typeof Bitcoin][] = [
  ['crypto', 'Crypto', Bitcoin],
  ['security', 'Action / ETF', LineChart],
  ['fixed', 'Valeur fixe', Coins],
]

/** Saisie d'une quantité (accepte la virgule et les décimales, ex : 0,19465116). */
function QuantityInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(value ? String(value).replace('.', ',') : '')
  useEffect(() => {
    const parsed = parseFloat(text.replace(',', '.'))
    if ((isNaN(parsed) ? 0 : parsed) !== value) setText(value ? String(value).replace('.', ',') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      className={`${inputClass} num`}
      inputMode="decimal"
      placeholder="0"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseFloat(e.target.value.replace(/\s/g, '').replace(',', '.'))
        if (e.target.value.trim() === '') onChange(0)
        else if (!isNaN(n) && n >= 0) onChange(n)
      }}
    />
  )
}

function AssetSearch({ kind, onPick }: { kind: 'crypto' | 'security'; onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function run() {
    if (q.trim().length < 2) return
    setBusy(true)
    setError(false)
    try {
      setResults(await searchAssets(kind, q.trim()))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={q}
          placeholder={kind === 'crypto' ? 'Ex : bitcoin, ETH, solana' : 'Ex : NVIDIA, FR0011550185, WPEA'}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              run()
            }
          }}
        />
        <button
          type="button"
          onClick={run}
          className="grid w-12 shrink-0 place-items-center rounded-xl bg-accent text-white dark:text-bg"
          aria-label="Rechercher"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </button>
      </div>
      {error && <p className="text-sm text-neg">Recherche impossible pour le moment (connexion ?).</p>}
      {results && results.length === 0 && <p className="text-sm text-muted">Aucun résultat.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  onPick(r)
                  setResults(null)
                  setQ('')
                }}
              >
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InvestmentCard({
  inv,
  quotes,
  onChange,
  onDelete,
}: {
  inv: Investment
  quotes: Quotes
  onChange: (patch: Partial<Investment>) => void
  onDelete: () => void
}) {
  const v = valueOf(inv, quotes)
  const live = inv.kind !== 'fixed'
  const [searching, setSearching] = useState(live && !inv.symbol)

  return (
    <ItemCard onDelete={onDelete}>
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line">
        {KINDS.map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              onChange(k === 'fixed' ? { kind: k, symbol: '', quantity: 1 } : { kind: k, symbol: '' })
              setSearching(k !== 'fixed')
            }}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-semibold transition ${
              inv.kind === k ? 'bg-accent text-white dark:text-bg' : 'text-muted'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {live && (
        <Field group label={inv.kind === 'crypto' ? 'Quelle crypto ?' : 'Quel titre ? (nom, ISIN ou code)'}>
          {searching || !inv.symbol ? (
            <AssetSearch
              kind={inv.kind as 'crypto' | 'security'}
              onPick={(r) => {
                onChange({ symbol: r.id, label: inv.label || r.label })
                setSearching(false)
              }}
            />
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3.5 py-2.5 ring-1 ring-line">
              <span className="num text-sm font-semibold">{inv.symbol}</span>
              <button type="button" className="text-sm font-semibold text-accent" onClick={() => setSearching(true)}>
                Changer
              </button>
            </div>
          )}
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <TextInput value={inv.label} placeholder={inv.kind === 'fixed' ? 'Espèces PEA' : 'Bitcoin'} onChange={(label) => onChange({ label })} />
        </Field>
        <Field label="Où ? (optionnel)">
          <TextInput value={inv.account ?? ''} placeholder="OKX, PEA, compte-titres…" onChange={(account) => onChange({ account: account || undefined })} />
        </Field>
        {live ? (
          <Field label="Quantité détenue">
            <QuantityInput value={inv.quantity} onChange={(quantity) => onChange({ quantity })} />
          </Field>
        ) : (
          <Field label="Valeur">
            <MoneyInput value={inv.manualUnitPrice} onChange={(manualUnitPrice) => onChange({ manualUnitPrice, quantity: 1 })} />
          </Field>
        )}
      </div>

      {live && inv.symbol && (
        <div className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          <span>
            {v.source === 'live' ? (
              <>Cours : <span className="num font-semibold">{formatEuros(Math.round(v.unitPrice * 100))}</span></>
            ) : (
              'Cours en direct indisponible'
            )}
          </span>
          <span className="num font-bold">{formatEuros(v.value)}</span>
        </div>
      )}

      {live && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-muted">Prix de secours (si le cours en direct ne répond pas)</summary>
          <div className="mt-2">
            <MoneyInput value={inv.manualUnitPrice} onChange={(manualUnitPrice) => onChange({ manualUnitPrice })} />
          </div>
        </details>
      )}
    </ItemCard>
  )
}

export function InvestmentsSection({
  plan,
  quotes,
  setPlan,
}: {
  plan: Plan
  quotes: Quotes
  setPlan: (u: (p: Plan) => Plan) => void
}) {
  const list = plan.investments ?? []
  const total = list.reduce((s, inv) => s + valueOf(inv, quotes).value, 0)
  const update = (id: string, patch: Partial<Investment>) =>
    setPlan((p) => ({ ...p, investments: (p.investments ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }))

  return (
    <Section
      icon={TrendingUp}
      tone="emerald"
      title="Investissements"
      subtitle="Crypto, actions, ETF… valeur mise à jour en direct"
      total={list.length ? formatEuros(total, { round: true }) : undefined}
      defaultOpen={list.length > 0}
    >
      {list.map((inv) => (
        <InvestmentCard
          key={inv.id}
          inv={inv}
          quotes={quotes}
          onChange={(patch) => update(inv.id, patch)}
          onDelete={() => setPlan((p) => ({ ...p, investments: (p.investments ?? []).filter((x) => x.id !== inv.id) }))}
        />
      ))}
      <AddButton onClick={() => setPlan((p) => ({ ...p, investments: [...(p.investments ?? []), newInvestment()] }))}>
        Ajouter un investissement
      </AddButton>
      {list.length > 0 && (
        <p className="px-1 text-xs text-muted">
          Vos placements ne comptent pas dans « je peux dépenser » : seules vos liquidités servent à payer vos dépenses.
        </p>
      )}
    </Section>
  )
}
