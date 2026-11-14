import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronDown, FileUp, ListChecks, PiggyBank, Receipt, Sparkles, Tag } from 'lucide-react'
import { merchantKey } from '../domain/categories'
import { INVEST, NONE, analyzeMonth, lineOptions, withLinkRule, type MonthAnalysis } from '../domain/matching'
import { formatEuros } from '../domain/money'
import { monthLabel, monthOf } from '../domain/month'
import { setActual, startMonthOf, toggleSettled, paidKeys, paidKey } from '../domain/projection'
import { detectColumns, parseCsv, toTransactions, type ColumnRole, type ParsedCsv, type Transaction } from '../domain/statement'
import { parsePdfLines, type PdfOptions } from '../domain/pdfStatement'
import { pdfToLines } from '../sync/pdfText'
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
  const [csvFile, setCsvFile] = useState<ParsedCsv | null>(null)
  const [csvRoles, setCsvRoles] = useState<ColumnRole[]>([])
  // Relevé PDF : lignes de texte + réglages de lecture
  const [pdfLines, setPdfLines] = useState<string[] | null>(null)
  const [pdfOpts, setPdfOpts] = useState<Partial<PdfOptions>>({})
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const pdf = useMemo(() => (pdfLines ? parsePdfLines(pdfLines, pdfOpts) : null), [pdfLines, pdfOpts])
  const csv = pdf ? pdf.csv : csvFile
  const roles = pdf ? pdf.roles : csvRoles
  const setRoles = setCsvRoles
  const result = useMemo(() => (csv ? toTransactions(csv, roles) : null), [csv, roles])
  const dates = result?.transactions.map((t) => t.date).sort() ?? []

  async function read(file: File) {
    setError(null)
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      setReading(true)
      try {
        const lines = await pdfToLines(file)
        const parsed = parsePdfLines(lines)
        if (parsed.csv.rows.length === 0) {
          setError('Aucune opération trouvée dans ce PDF. S’il s’agit d’un scan (image), il ne peut pas être lu : exportez plutôt le relevé en CSV.')
          return
        }
        setPdfOpts({})
        setPdfLines(lines)
      } catch (e) {
        setError(
          /password/i.test(String(e))
            ? 'Ce PDF est protégé par un mot de passe : il ne peut pas être lu.'
            : 'Impossible de lire ce PDF. Essayez l’export CSV de votre banque.',
        )
      } finally {
        setReading(false)
      }
      return
    }
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.header.length < 2 || parsed.rows.length === 0) {
      setError('Ce fichier ne ressemble pas à un relevé (PDF ou CSV).')
      return
    }
    setCsvFile(parsed)
    setCsvRoles(detectColumns(parsed.header))
  }
  const reset = () => {
    setCsvFile(null)
    setPdfLines(null)
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
            Choisissez votre relevé bancaire au format <strong className="text-ink">PDF</strong> ou <strong className="text-ink">CSV</strong>. Tout
            est lu sur votre téléphone ; seules les opérations (date, montant, libellé) sont enregistrées dans votre compte.
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
            <span className="font-semibold">{reading ? 'Lecture du relevé…' : 'Choisir le relevé (PDF ou CSV)'}</span>
            <input
              type="file"
              accept=".pdf,application/pdf,.csv,text/csv,text/plain"
              className="hidden"
              disabled={reading}
              onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
            />
          </label>
          {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-neg">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          {pdf ? (
            <div className="space-y-2">
              <p className="text-muted">Relevé PDF lu : vérifiez quelques lignes ci-dessous. Si les montants semblent faux, ajustez :</p>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">Quand une ligne contient deux montants</span>
                <select
                  className={`${inputClass} py-2 text-sm`}
                  value={pdfOpts.pick ?? pdf.suggestedPick}
                  onChange={(e) => setPdfOpts({ ...pdfOpts, pick: e.target.value as PdfOptions['pick'] })}
                >
                  <option value="secondLast">Le montant est l’avant-dernier (le dernier est le solde)</option>
                  <option value="last">Le montant est le dernier de la ligne</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">Montants écrits sans + ni −</span>
                <select
                  className={`${inputClass} py-2 text-sm`}
                  value={pdfOpts.unsigned ?? 'expense'}
                  onChange={(e) => setPdfOpts({ ...pdfOpts, unsigned: e.target.value as PdfOptions['unsigned'] })}
                >
                  <option value="expense">Ce sont des dépenses</option>
                  <option value="income">Ce sont des rentrées</option>
                </select>
              </label>
            </div>
          ) : (
          <>
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
          </>
          )}
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
                {result.transactions.slice(0, pdf ? 8 : 3).map((t) => (
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
            <button type="button" onClick={reset} className="flex-1 rounded-full py-2.5 font-semibold text-muted hover:bg-surface-2">
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
/** Fiche d'une opération : sur quelle ligne de « Mes données » elle tombe. */
function TxSheet({
  t,
  plan,
  assigned,
  setPlan,
  setCategory,
  onClose,
  queueLeft,
  onNext,
}: {
  t: Transaction
  plan: Plan
  /** Ligne actuelle (null = non prévue) */
  assigned: string | null
  setPlan: (u: (p: Plan) => Plan) => void
  setCategory: (id: string, c: string | null) => Promise<void>
  onClose: () => void
  queueLeft?: number
  onNext?: () => void
}) {
  const merchant = merchantKey(t.label) || t.label
  const [forMerchant, setForMerchant] = useState(false)
  const options = lineOptions(plan, t.amount)

  async function choose(id: string) {
    if (forMerchant) {
      setPlan((p) => withLinkRule(p, `m:${merchantKey(t.label)}`, id))
      await setCategory(t.id, null)
    } else await setCategory(t.id, id)
    if (onNext) onNext()
  }

  return (
    <Sheet title={t.label} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        {day(t.date)} · <span className={`num font-semibold ${t.amount < 0 ? 'text-neg' : 'text-pos'}`}>{exact(t.amount)}</span>
        {t.description && t.description !== t.label && <span className="block truncate text-xs">{t.description}</span>}
      </p>
      {queueLeft !== undefined && (
        <p className="mt-2 rounded-xl bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink">À classer : encore {queueLeft} après celle-ci</p>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Tag size={14} /> {t.amount < 0 ? 'Quelle dépense de « Mes données » ?' : 'Quel revenu de « Mes données » ?'}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setForMerchant(false)}
          className={`rounded-lg px-2 py-1.5 ${!forMerchant ? 'bg-surface text-accent shadow-sm' : 'text-muted'}`}
        >
          Cette opération seulement
        </button>
        <button
          type="button"
          onClick={() => setForMerchant(true)}
          className={`truncate rounded-lg px-2 py-1.5 ${forMerchant ? 'bg-surface text-accent shadow-sm' : 'text-muted'}`}
        >
          Toujours pour « {merchant} »
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
              o.id === assigned ? 'bg-accent text-white ring-accent dark:text-bg' : 'bg-surface-2 text-ink ring-line hover:bg-accent-soft'
            }`}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => choose(NONE)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
            assigned === null && (t.category === NONE || plan.txRules?.links[`m:${merchantKey(t.label)}`] === NONE)
              ? 'bg-neg text-white ring-neg'
              : 'bg-surface-2 text-neg ring-line hover:bg-neg-soft'
          }`}
        >
          Non prévu
        </button>
        <button
          type="button"
          onClick={() => choose(INVEST)}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
            assigned === INVEST ? 'bg-pos text-white ring-pos' : 'bg-surface-2 text-pos ring-line hover:bg-pos-soft'
          }`}
        >
          <PiggyBank size={13} /> Investissement / épargne
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        « Investissement / épargne » : argent placé (crypto, courtier, livret…) ou récupéré d’un placement. Il reste à vous, donc il n’est compté ni en
        dépense ni en rentrée.
      </p>
      {options.length === 0 && (
        <p className="mt-2 text-xs text-muted">Aucune ligne dans « Mes données » pour l’instant : ajoutez vos dépenses fixes (loyer, courses…) pour pouvoir classer.</p>
      )}
      <p className="mt-2 text-xs text-muted">Pour une nouvelle catégorie, ajoutez une ligne dans « Mes données » (ex. une dépense fixe « Sorties »).</p>
      <div className="mt-5 flex gap-2">
        {onNext && (
          <button type="button" onClick={onNext} className="flex-1 rounded-full py-2.5 text-sm font-semibold text-muted hover:bg-surface-2">
            Passer
          </button>
        )}
        <button type="button" onClick={onClose} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-white dark:text-bg">
          {onNext ? 'Terminer' : 'OK'}
        </button>
      </div>
    </Sheet>
  )
}

function TxRow({ t, label, onOpen }: { t: Transaction; label: string | null; onOpen: () => void }) {
  const invest = label === INVEST_LABEL
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-surface-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t.label}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          {day(t.date)}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              invest ? 'bg-pos-soft text-pos' : label ? 'bg-surface-2 text-ink ring-1 ring-line' : 'bg-warn-soft text-warn'
            }`}
          >
            {invest ? <PiggyBank size={10} /> : <Tag size={10} />} {label ?? 'Non classé'}
          </span>
        </span>
      </span>
      <span className={`num shrink-0 font-bold ${invest ? 'text-muted' : t.amount < 0 ? 'text-neg' : 'text-pos'}`}>{exact(t.amount)}</span>
    </button>
  )
}

const INVEST_LABEL = 'Investissement'

function Bar({ value, planned }: { value: number; planned: number }) {
  // Barre du réel ; trait = montant prévu ; rouge si dépassé
  const max = Math.max(value, planned, 1)
  const over = planned > 0 && value > planned
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${over ? 'bg-neg' : 'bg-accent'}`} style={{ width: `${Math.max(value > 0 ? 2 : 0, (value / max) * 100)}%` }} />
      {planned > 0 && <div className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `calc(${(planned / max) * 100}% - 1px)` }} />}
    </div>
  )
}

function applyToPlan(plan: Plan, a: MonthAnalysis): Plan {
  // Reporte les vrais montants et coche les lignes retrouvées (déjà passées sur le compte)
  let p = plan
  const keys = paidKeys(p)
  for (const l of a.lines) {
    if (l.txs.length === 0 || l.planned === 0) continue
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
  const [queue, setQueue] = useState<string[] | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const months = useMemo(() => [...new Set(tx.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [tx.transactions])
  const [chosen, setChosen] = useState<string | null>(null)
  const month = chosen && months.includes(chosen) ? chosen : (months[0] ?? monthOf(new Date()))
  const a = useMemo(() => analyzeMonth(plan, tx.transactions, month), [plan, tx.transactions, month])
  // Ligne de chaque opération du mois (null = non prévue)
  const lineOf = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const l of a.lines) for (const t of l.txs) m.set(t.id, l.id)
    for (const t of a.unplanned) m.set(t.id, null)
    for (const t of a.investTxs) m.set(t.id, INVEST)
    return m
  }, [a])
  const labelOf = (id: string | null | undefined) => (id === INVEST ? INVEST_LABEL : id ? (a.lines.find((l) => l.id === id)?.label ?? null) : null)
  const allOfMonth = useMemo(
    () => tx.transactions.filter((t) => t.date.startsWith(month)).sort((x, y) => y.date.localeCompare(x.date)),
    [tx.transactions, month],
  )
  // À classer : dépenses non rattachées, sans choix « non prévu » explicite
  const toSort = a.unplanned.filter((t) => t.category !== NONE && plan.txRules?.links[`m:${merchantKey(t.label)}`] !== NONE)
  const expenseLines = a.lines.filter((l) => l.kind === 'fixedExpense' || l.kind === 'plannedExpense').filter((l) => l.planned < 0 || l.real < 0)
  const canApply = month >= startMonthOf(plan) && a.lines.some((l) => l.txs.length > 0 && l.planned !== 0)
  const currentId = queue ? queue[0] : openId
  const open = tx.transactions.find((t) => t.id === currentId) ?? null
  const next = () => setQueue((q) => (q && q.length > 1 ? q.slice(1) : null))

  const sheets = (
    <>
      {importing && <ImportSheet onClose={() => setImporting(false)} onImport={tx.add} />}
      {open && (
        <TxSheet
          key={open.id}
          t={open}
          plan={plan}
          assigned={lineOf.get(open.id) ?? null}
          setPlan={setPlan}
          setCategory={tx.setCategory}
          onClose={() => {
            setOpenId(null)
            setQueue(null)
          }}
          {...(queue ? { queueLeft: queue.length - 1, onNext: next } : {})}
        />
      )}
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
            Importez le relevé de votre banque (PDF ou CSV) : l’app range chaque opération dans vos lignes de « Mes données » (loyer, courses…),
            compare au prévu, et vous montre où part l’argent non prévu.
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
                  <p>Les dépenses de ce mois qui ne tombent sur aucune de vos lignes de « Mes données ». C’est là que se cache l’écart entre ce que vous aviez prévu et votre vrai solde.</p>
                  <p>Touchez une opération pour la ranger dans une de vos lignes (loyer, courses…), pour cette opération seulement ou pour ce commerçant à chaque fois.</p>
                </Help>
              </p>
              <p className="text-xs text-muted">{a.unplanned.length} opération(s) non prévue(s) ce mois-ci</p>
            </div>
            {a.investTxs.length > 0 && (
              <div className="mt-2 rounded-2xl bg-pos-soft px-3.5 py-3 ring-1 ring-pos/15">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-pos">
                  <PiggyBank size={15} /> {a.invested >= 0 ? 'Placé' : 'Retiré de vos placements'} : <span className="num">{eur(Math.abs(a.invested))}</span>
                  <Help title="Investissement / épargne">
                    <p>L’argent envoyé vers vos placements (crypto, courtier, livret…) baisse vos liquidités, mais il reste à vous : il n’est donc pas compté dans « Dépensé » ni dans « Hors prévisions ».</p>
                    <p>Pensez à mettre à jour la quantité de l’investissement concerné dans « Mes données » pour que votre patrimoine reste juste.</p>
                  </Help>
                </p>
                <p className="text-xs text-muted">{a.investTxs.length} opération(s) · pas comptées comme dépenses, ça reste votre argent</p>
              </div>
            )}
          </section>

          {toSort.length > 0 && (
            <section className="flex items-center gap-3 rounded-3xl bg-warn-soft p-4 ring-1 ring-warn/20">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn">
                <ListChecks size={20} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold">
                  {toSort.length} opération{toSort.length > 1 ? 's' : ''} à classer
                </p>
                <p className="text-xs text-muted">Rangez-les dans vos lignes, une par une.</p>
              </div>
              <button
                type="button"
                onClick={() => setQueue(toSort.map((t) => t.id))}
                className="shrink-0 rounded-full bg-warn px-4 py-2 text-sm font-bold text-white dark:text-bg"
              >
                Classer
              </button>
            </section>
          )}

          {/* Par catégorie = vos lignes de « Mes données » */}
          <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-bold">Par catégorie</h2>
            <p className="mb-3 text-xs text-muted">Vos lignes de « Mes données » : réel du mois (barre) et prévu (trait).</p>
            <ul className="space-y-3">
              {expenseLines.map((l) => {
                const real = Math.abs(l.real)
                const planned = Math.abs(l.planned)
                const over = planned > 0 && real > planned + 50
                return (
                  <li key={l.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-semibold">
                        {l.label} {l.txs.length > 0 && <span className="text-xs font-normal text-muted">· {l.txs.length}</span>}
                      </span>
                      <span className="num shrink-0">
                        <span className={`font-bold ${over ? 'text-neg' : ''}`}>{l.txs.length ? eur(real) : '—'}</span>
                        <span className="text-xs text-muted"> / {eur(planned)}</span>
                      </span>
                    </div>
                    <Bar value={real} planned={planned} />
                  </li>
                )
              })}
              {a.unplannedTotal > 0 && (
                <li>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-neg">Non prévu · {a.unplanned.length}</span>
                    <span className="num font-bold text-neg">{eur(a.unplannedTotal)}</span>
                  </div>
                  <Bar value={a.unplannedTotal} planned={0} />
                </li>
              )}
            </ul>
            {canApply && (
              <div className="mt-4 rounded-2xl bg-accent-soft p-3 text-xs text-accent-ink">
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
            <p className="mb-1 text-xs text-muted">Du plus gros au plus petit · touchez pour ranger dans une ligne</p>
            {a.unplanned.length === 0 ? (
              <p className="py-3 text-sm text-muted">Rien : toutes les dépenses tombent sur vos lignes prévues.</p>
            ) : (
              <ul className="divide-y divide-line">
                {a.unplanned.map((t) => (
                  <li key={t.id}>
                    <TxRow t={t} label={null} onOpen={() => setOpenId(t.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Investissements */}
          {a.investTxs.length > 0 && (
            <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
              <h2 className="flex items-center gap-1.5 font-bold">
                <PiggyBank size={17} className="text-pos" /> Investi ce mois
              </h2>
              <p className="mb-1 text-xs text-muted">Moins de liquidités, mais toujours dans votre patrimoine · touchez pour corriger</p>
              <ul className="divide-y divide-line">
                {a.investTxs.map((t) => (
                  <li key={t.id}>
                    <TxRow t={t} label={INVEST_LABEL} onOpen={() => setOpenId(t.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Toutes les opérations */}
          <details className="group rounded-3xl bg-surface ring-1 ring-line">
            <summary className="flex cursor-pointer list-none items-center justify-between p-4">
              <span className="font-bold">Toutes les opérations · {allOfMonth.length}</span>
              <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
            </summary>
            <ul className="divide-y divide-line px-4 pb-3">
              {allOfMonth.map((t) => (
                <li key={t.id}>
                  <TxRow t={t} label={labelOf(lineOf.get(t.id))} onOpen={() => setOpenId(t.id)} />
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
