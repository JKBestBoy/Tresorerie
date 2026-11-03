import { Wallet } from 'lucide-react'

export function Logo({ className = 'h-9 w-9', size = 18 }: { className?: string; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30 ${className}`}
    >
      <Wallet size={size} strokeWidth={2.2} />
    </span>
  )
}
