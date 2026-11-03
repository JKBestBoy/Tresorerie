import { useEffect, useState, type ReactNode } from 'react'
import { parseEuros } from '../domain/money'
import type { Cents, MonthKey } from '../domain/types'

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

function centsToText(c: Cents): string {
  if (c === 0) return ''
  return (c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2, useGrouping: false })
}

/** Champ de montant en euros ; renvoie des centimes. */
export function MoneyInput({ value, onChange, placeholder = '0' }: { value: Cents; onChange: (c: Cents) => void; placeholder?: string }) {
  const [text, setText] = useState(centsToText(value))
  const parsed = text.trim() === '' ? 0 : parseEuros(text)
  // Resynchronise si la valeur change de l'extérieur (ex : chargement de l'exemple)
  useEffect(() => {
    if (parsed !== value) setText(centsToText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const invalid = parsed === null || parsed < 0
  return (
    <div className="relative">
      <input
        className={`${inputClass} pr-8 ${invalid ? 'border-red-500' : ''}`}
        inputMode="decimal"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const c = e.target.value.trim() === '' ? 0 : parseEuros(e.target.value)
          if (c !== null && c >= 0) onChange(c)
        }}
      />
      <span className="pointer-events-none absolute right-3 top-2 text-slate-400">€</span>
    </div>
  )
}

/** Sélecteur de mois ; vide = null si `optional`. */
export function MonthInput({
  value,
  onChange,
  optional,
  emptyLabel,
}: {
  value: MonthKey | null
  onChange: (m: MonthKey | null) => void
  optional?: boolean
  emptyLabel?: string
}) {
  return (
    <div className="flex gap-2">
      <input
        type="month"
        className={inputClass}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v) onChange(v)
          else if (optional) onChange(null)
        }}
      />
      {optional && value !== null && (
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100"
          onClick={() => onChange(null)}
          title={emptyLabel}
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
