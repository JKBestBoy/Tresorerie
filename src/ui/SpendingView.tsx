import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronDown, FileUp, Link2, Receipt, Sparkles, Tag } from 'lucide-react'
import { CATEGORIES, categoryById, merchantKey } from '../domain/categories'
import { analyzeMonth, categoryOf, planLinesOf, withCategoryRule, withLinkRule, type MonthAnalysis } from '../domain/matching'
import { formatEuros } from '../domain/money'
import { monthLabel, monthOf } from '../domain/month'
import { setActual, startMonthOf, toggleSettled, paidKeys, paidKey } from '../domain/projection'
import { detectColumns, parseCsv, toTransactions, type ColumnRole, type ParsedCsv, type Transaction } from '../domain/statement'
import type { Cents, Plan } from '../domain/types'
import type { useTransactions } from '../sync/transactions'
import { Help } from './Help'
import { inputClass } from './inputs'

const eur = (c: Cents) => formatEuros(c, { round: true })
const exact = (c: Cents) => formatEuros(c)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'))

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: 'Date',
  amount: 'Montant',
  debit: 'Débit (sorties)',
  credit: 'Crédit (entrées)',
  label: 'Commerçant / nom',
  description: 'Libellé',
  ignore: '— ignorer —',
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-5 text-left text-ink shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold">{title}</p>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Import d'un relevé : lecture, colonnes reconnues (modifiables), aperçu, import. */
function ImportSheet({ onClose, onImport }: { onClose: () => void; onImport: (txs: Transaction[]) => Promise<number> }) {
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [roles, setRoles] = useState<ColumnRole[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const result = useMemo(() => (csv ? toTransactions(csv, roles) : null), [csv, roles])
  const dates = result?.transactions.map((t) => t.date).sort() ?? []

  async function read(file: File) {
    setError(null)
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.header.length < 2 || parsed.rows.length === 0) {
      setError('Ce fichier ne ressemble pas à un relevé CSV. Exportez votre relevé au format CSV depuis votre banque.')
      return
    }
    setCsv(parsed)
    setRoles(detectColumns(parsed.header))
  }

  const ok = roles.includes('date') && (roles.includes('amount') || roles.includes('debit') || roles.includes('credit'))

  return (
    <Sheet title="Importer un relevé" onClose={onClose}>
      {done !== null ? (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-pos-soft px-3 py-2.5 text-sm text-pos">
            <CheckCircle2 size={18} /> {done} nouvelle{done > 1 ? 's' : ''} opération{done > 1 ? 's' : ''} importée{done > 1 ? 's' : ''}
            {result && result.transactions.length > done && ` (${result.transactions.length - done} déjà connue${result.transactions.length - done > 1 ? 's' : ''})`}.
          </p>
          <button type="button" onClick={onClose} className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-white dark:text-bg">
            Voir l’analyse
          </button>
        </div>
      ) : !csv ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            Exportez votre relevé au format <strong className="text-ink">CSV</strong> depuis votre banque, puis choisissez le fichier. Tout est lu sur
            votre téléphone ; seules les opérations (date, montant, libellé) sont enregistrées dans votre compte.
          </p>
          <details className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
            <summary className="cursor-pointer font-semibold text-ink">Comment exporter depuis bunq ?</summary>
            <p className="mt-2">
              Dans l’app bunq : touchez votre compte, puis le menu (⋯ ou ⚙︎) › <em>Relevé</em> / <em>Export statement</em> › choisissez la période
              et le format <strong>CSV</strong>. Enregistrez le fichier dans « Fichiers », puis revenez ici.
            </p>
          </details>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center hover:border-accent/50 hover:bg-accent-soft">
            <FileUp size={28} className="text-accent" />
            <span className="font-semibold">Choisir le fichier CSV</span>
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>
          {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-neg">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">Vérifiez que les colonnes sont bien reconnues :</p>
          <div className="space-y-2">
            {csv.header.map((h, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{h || `Colonne ${i + 1}`}</span>
                  <span className="block truncate text-xs text-muted">{csv.rows[0]?.[i] ?? ''}</span>
                </span>
                <select
                  className={`${inputClass} py-2 text-sm`}
                  value={roles[i]}
                  onChange={(e) => setRoles(roles.map((r, j) => (j === i ? (e.target.value as ColumnRole) : r)))}
                >
                  {(Object.keys(ROLE_LABELS) as ColumnRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {result && ok && (
            <div className="rounded-xl bg-surface-2 px-3 py-2.5">
              <p className="font-semibold">
                {result.transactions.length} opération{result.transactions.length > 1 ? 's' : ''}
                {dates.length > 0 && (
                  <span className="font-normal text-muted">
                    {' '}
                    · du {day(dates[0])} au {day(dates[dates.length - 1])}
                  </span>
                )}
              </p>
              {result.skipped > 0 && <p className="text-xs text-warn">{result.skipped} ligne(s) illisible(s) ignorée(s)</p>}
              <ul className="mt-2 space-y-1 text-xs">
                {result.transactions.slice(0, 3).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {day(t.date)} · {t.label}
                    </span>
                    <span className={`num shrink-0 font-semibold ${t.amount < 0 ? 'text-neg' : 'text-pos'}`}>{exact(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!ok && <p className="rounded-xl bg-warn-soft px-3 py-2 text-warn">Indiquez au moins la colonne Date et la colonne Montant.</p>}
          {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-neg">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setCsv(null)} className="flex-1 rounded-full py-2.5 font-semibold text-muted hover:bg-surface-2">
              Autre fichier
            </button>
            <button
              type="button"
              disabled={!ok || busy || !result?.transactions.length}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  setDone(await onImport(result!.transactions))
                } catch {
                  setError('L’import a échoué (connexion ?). Réessayez.')
                } finally {
                  setBusy(false)
                }
              }}
              className="flex-1 rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-40 dark:text-bg"
            >
              {busy ? 'Import…' : 'Importer'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** Fiche d'une opération : catégorie (mémorisable) et rattachement à une ligne du plan. */
function TxSheet({
  t,
  plan,
  setPlan,
  setCategory,
  onClose,
}: {
  t: Transaction
  plan: Plan
  setPlan: (u: (p: Plan) => Plan) => void
  setCategory: (id: string, c: string | null) => Promise<void>
  onClose: () => void
}) {
  const current = categoryOf(t, plan)
  const [remember, setRemember] = useState(true)
  const lines = planLinesOf(plan, t.date.slice(0, 7)).filter((l) => Math.sign(l.planned) === Math.sign(t.amount))
  const mKey = `m:${merchantKey(t.label)}`
  const linked = plan.txRules?.links[mKey]
  return (
    <Sheet title={t.label} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        {day(t.date)} · <span className={`num font-semibold ${t.amount < 0 ? 'text-neg' : 'text-pos'}`}>{exact(t.amount)}</span>
        {t.description && t.description !== t.label && <span className="block truncate text-xs">{t.description}</span>}
      </p>
      <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Tag size={14} /> Catégorie
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={async () => {
              if (remember) setPlan((p) => withCategoryRule(p, t.label, c.id))
              await setCategory(t.id, remember ? null : c.id)
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
              c.id === current ? 'bg-accent text-white ring-accent dark:text-bg' : 'bg-surface-2 text-ink ring-line hover:bg-accent-soft'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Toujours pour « {merchantKey(t.label) || t.label} »
      </label>
      <p className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Link2 size={14} /> Correspond à une ligne prévue ?
      </p>
      <select
        className={`${inputClass} mt-2 text-sm`}
        value={linked ?? ''}
        onChange={(e) => setPlan((p) => withLinkRule(p, mKey, e.target.value || null))}
      >
        <option value="">Non : dépense non prévue</option>
        {lines.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label} (prévu {exact(Math.abs(l.planned))})
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">Retenu pour toutes les opérations de ce commerçant.</p>
      <button type="button" onClick={onClose} className="mt-5 w-full rounded-full bg-accent py-2.5 text-sm font-bold text-white dark:text-bg">
        OK
      </button>
    </Sheet>
  )
}

function TxRow({ t, onOpen }: { t: Transaction; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-surface-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t.label}</span>
        <span className="block truncate text-xs text-muted">
          {day(t.date)} · {categoryById(t.category).label}
        </span>
      </span>
      <span className={`num shrink-0 font-bold ${t.amount < 0 ? 'text-neg' : 'text-pos'}`}>{exact(t.amount)}</span>
    </button>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-accent" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  )
}

function applyToPlan(plan: Plan, a: MonthAnalysis): Plan {
  // Reporte les vrais montants et coche les lignes rapprochées (déjà passées sur le compte)
  let p = plan
  const keys = paidKeys(p)
  for (const l of a.lines) {
    if (l.txs.length === 0) continue
    p = setActual(p, a.month, l.id, Math.abs(l.real))
    if (!keys.has(paidKey(a.month, l.id))) p = toggleSettled(p, a.month, l.id)
  }
  return p
}

export function SpendingView({
  plan,
  setPlan,
  tx,
}: {
  plan: Plan
  setPlan: (u: (p: Plan) => Plan) => void
  tx: ReturnType<typeof useTransactions>
}) {
  const [importing, setImporting] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = tx.transactions.find((t) => t.id === openId) ?? null
  const [applied, setApplied] = useState<string | null>(null)
  const months = useMemo(() => {
    const set = new Set(tx.transactions.map((t) => t.date.slice(0, 7)))
    return [...set].sort().reverse()
  }, [tx.transactions])
  const [chosen, setChosen] = useState<string | null>(null)
  const month = chosen && months.includes(chosen) ? chosen : (months[0] ?? monthOf(new Date()))
  const a = useMemo(() => analyzeMonth(plan, tx.transactions, month), [plan, tx.transactions, month])
  const allOfMonth = useMemo(
    () =>
      tx.transactions
        .filter((t) => t.date.startsWith(month))
        .map((t) => ({ ...t, category: categoryOf(t, plan) }))
        .sort((x, y) => y.date.localeCompare(x.date)),
    [tx.transactions, month, plan],
  )
  const canApply = month >= startMonthOf(plan) && a.lines.some((l) => l.txs.length > 0)

  const sheets = (
    <>
      {importing && <ImportSheet onClose={() => setImporting(false)} onImport={tx.add} />}
      {open && <TxSheet t={open} plan={plan} setPlan={setPlan} setCategory={tx.setCategory} onClose={() => setOpenId(null)} />}
    </>
  )

  if (!tx.loading && tx.transactions.length === 0) {
    return (
      <>
        <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-line">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Receipt size={26} />
          </div>
          <p className="font-semibold">Analysez vos vraies dépenses</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Importez le relevé de votre banque (fichier CSV) : l’app classe chaque opération, la compare à ce que vous aviez prévu, et vous montre
            où part l’argent non prévu.
          </p>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 font-bold text-white shadow-md shadow-indigo-500/30"
          >
            <FileUp size={18} /> Importer un relevé
          </button>
        </div>
        {sheets}
      </>
    )
  }

  const maxCat = Math.max(...a.byCategory.map((c) => c.total), 1)

  return (
    <>
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        {/* Mois + import */}
        <div className="flex items-center gap-2">
          <select className={`${inputClass} flex-1 font-semibold`} value={month} onChange={(e) => setChosen(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {cap(monthLabel(m))}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-semibold text-white dark:text-bg"
          >
            <FileUp size={16} /> Importer
          </button>
        </div>

        {/* Synthèse */}
        <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted">Dépensé</p>
              <p className="num text-2xl font-extrabold">{eur(a.spent)}</p>
              <p className="text-xs text-muted">prévu {eur(a.plannedSpent)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Rentré</p>
              <p className="num text-2xl font-extrabold text-pos">{eur(a.received)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-neg-soft px-3.5 py-3 ring-1 ring-neg/15">
            <p className="flex items-center gap-1 text-sm font-semibold text-neg">
              Hors prévisions : <span className="num">{eur(a.unplannedTotal)}</span>
              <Help title="Hors prévisions">
                <p>Les dépenses de ce mois qui ne correspondent à aucune ligne prévue (dépenses fixes, grosses dépenses). C’est là que se cache l’écart entre ce que vous aviez prévu et votre vrai solde.</p>
                <p>Touchez une opération pour changer sa catégorie, ou dire qu’elle correspond à une ligne prévue (ex : « ce virement, c’est mon loyer »). L’app s’en souviendra pour les prochains relevés.</p>
              </Help>
            </p>
            <p className="text-xs text-muted">{a.unplanned.length} opération(s) non prévue(s) ce mois-ci</p>
          </div>
        </section>

        {/* Par catégorie */}
        <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="mb-3 font-bold">Par catégorie</h2>
          <ul className="space-y-3">
            {a.byCategory.map((c) => (
              <li key={c.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">
                    {c.label} <span className="text-xs font-normal text-muted">· {c.count}</span>
                  </span>
                  <span className="num font-bold">{eur(c.total)}</span>
                </div>
                <Bar value={c.total} max={maxCat} />
              </li>
            ))}
          </ul>
        </section>

        {/* Lignes prévues */}
        <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="mb-1 font-bold">Prévu ou réel</h2>
          <p className="mb-2 text-xs text-muted">Vos lignes prévues ce mois-ci, et ce que le relevé montre vraiment.</p>
          <ul className="divide-y divide-line">
            {a.lines
              .filter((l) => l.planned < 0 || l.txs.length)
              .map((l) => {
                const over = l.txs.length > 0 && Math.abs(l.real) > Math.abs(l.planned) + 50
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{l.label}</span>
                      <span className="block text-xs text-muted">prévu {exact(Math.abs(l.planned))}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {l.txs.length ? (
                        <span className={`num block font-bold ${over ? 'text-neg' : 'text-pos'}`}>{exact(Math.abs(l.real))}</span>
                      ) : (
                        <span className="block text-xs text-muted">pas encore vu</span>
                      )}
                      {l.txs.length > 1 && <span className="block text-[11px] text-muted">{l.txs.length} opérations</span>}
                    </span>
                  </li>
                )
              })}
          </ul>
          {canApply && (
            <div className="mt-3 rounded-2xl bg-accent-soft p-3 text-xs text-accent-ink">
              {applied === month ? (
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 size={14} /> Reporté dans « Mois par mois » : lignes cochées, vrais montants enregistrés.
                </p>
              ) : (
                <>
                  <p>
                    Reporter dans « Mois par mois » : cocher les lignes retrouvées dans le relevé et enregistrer leurs vrais montants. À faire après
                    avoir mis à jour votre solde (carte violette) avec celui de votre banque.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPlan((p) => applyToPlan(p, a))
                      setApplied(month)
                    }}
                    className="mt-2 flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 font-semibold text-white dark:text-bg"
                  >
                    <Sparkles size={14} /> Reporter dans mon pointage
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-4">
        {/* Non prévu */}
        <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
          <h2 className="font-bold">Ce qui n’était pas prévu</h2>
          <p className="mb-1 text-xs text-muted">Du plus gros au plus petit · touchez pour classer</p>
          {a.unplanned.length === 0 ? (
            <p className="py-3 text-sm text-muted">Rien : toutes les dépenses correspondent à vos prévisions.</p>
          ) : (
            <ul className="divide-y divide-line">
              {a.unplanned.map((t) => (
                <li key={t.id}>
                  <TxRow t={t} onOpen={() => setOpenId(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Toutes les opérations */}
        <details className="group rounded-3xl bg-surface ring-1 ring-line">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="font-bold">Toutes les opérations · {allOfMonth.length}</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-line px-4 pb-3">
            {allOfMonth.map((t) => (
              <li key={t.id}>
                <TxRow t={t} onOpen={() => setOpenId(t.id)} />
              </li>
            ))}
          </ul>
        </details>
      </div>

    </div>
    {sheets}
    </>
  )
}
