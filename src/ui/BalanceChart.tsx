import { Area, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatEuros } from '../domain/money'
import { monthLabel, monthShortLabel } from '../domain/month'
import type { Cents, MonthRow } from '../domain/types'

interface Point {
  month: string
  label: string
  solde: number
  markers: string[]
}

/** Graduations en euros : en entier sous 10 000, compactes au-delà (12 k). */
function tick(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)} k`
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
}

/** Graduations rondes (pas de 1, 2, 2,5 ou 5 × 10^n) couvrant [min, max]. */
function niceTicks(min: number, max: number, target = 4): number[] {
  const raw = (max - min || 1) / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => st >= raw) ?? 10 * pow
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v))
  return ticks
}

function ChartTooltip({ active, payload, cushion }: { active?: boolean; payload?: { payload: Point }[]; cushion: Cents }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const cents = Math.round(p.solde * 100)
  return (
    <div className="rounded-xl bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-line">
      <p className="font-semibold text-ink">{monthLabel(p.month)}</p>
      <p className="num mt-0.5 text-sm font-bold text-ink">{formatEuros(cents)}</p>
      <p className="text-muted">solde fin de mois</p>
      {cents < 0 ? (
        <p className="mt-1 font-semibold text-neg">Découvert</p>
      ) : cents < cushion ? (
        <p className="mt-1 font-semibold text-warn">Sous le matelas</p>
      ) : null}
      {p.markers.length > 0 && <p className="mt-1 text-muted">{p.markers.join(' · ')}</p>}
    </div>
  )
}

/** Point marqué sur les mois avec une grosse dépense : 8 px, anneau de la couleur de fond. */
function MarkerDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined || !payload?.markers.length) return null
  return <circle cx={cx} cy={cy} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
}

/** Courbe du solde de liquidités, mois par mois, avec le zéro et le matelas. */
export function BalanceChart({ rows, cushion }: { rows: MonthRow[]; cushion: Cents }) {
  const data: Point[] = rows.map((r) => ({
    month: r.month,
    label: monthShortLabel(r.month),
    solde: r.closing / 100,
    markers: r.plannedMarkers,
  }))
  const values = data.map((d) => d.solde)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const cushionEuros = cushion / 100
  // Le matelas n'est tracé que s'il reste dans l'échelle des soldes (sinon la courbe serait écrasée)
  const showCushion = cushion > 0 && cushionEuros <= max + (max - min) * 0.5
  const ticks = niceTicks(min, Math.max(max, showCushion ? cushionEuros : 0))
  const domain = [ticks[0], ticks[ticks.length - 1]]
  const negative = values.some((v) => v < 0)

  return (
    <section className="rounded-3xl bg-surface p-4 pb-2 ring-1 ring-line">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-bold">Solde de mes liquidités</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {negative && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-0.5 w-4 rounded bg-neg" /> 0 €
            </span>
          )}
          {cushion > 0 && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-0.5 w-4 rounded bg-warn" /> Matelas {formatEuros(cushion, { round: true })}
              {!showCushion && ' (hors graphique)'}
            </span>
          )}
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-2 w-2 rounded-full bg-accent" /> grosse dépense
          </span>
        </div>
      </div>
      <div className="h-56 sm:h-64" role="img" aria-label="Courbe du solde de fin de mois de vos liquidités">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="soldeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={14}
            />
            <YAxis
              domain={domain}
              ticks={ticks}
              tickFormatter={tick}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
            />
            {negative && <ReferenceLine y={0} stroke="var(--neg)" strokeWidth={1.5} />}
            {showCushion && <ReferenceLine y={cushionEuros} stroke="var(--warn)" strokeWidth={1.5} />}
            <Tooltip
              content={<ChartTooltip cushion={cushion} />}
              cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area type="linear" dataKey="solde" stroke="none" fill="url(#soldeFill)" isAnimationActive={false} />
            <Line
              type="linear"
              dataKey="solde"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={<MarkerDot />}
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
