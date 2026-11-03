import { useEffect, useState } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark'

function read(): ThemeChoice {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

/** Thème clair / sombre / automatique (suit le téléphone), mémorisé sur l'appareil. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = choice === 'dark' || (choice === 'auto' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b0d17' : '#f4f5fb')
    }
    apply()
    try {
      localStorage.setItem('theme', choice)
    } catch {
      /* stockage indisponible : le choix ne sera pas mémorisé */
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [choice])
  return [choice, setChoice] as const
}
