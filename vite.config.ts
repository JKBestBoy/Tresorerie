import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// BASE_PATH est fourni par le déploiement GitHub Pages ("/nom-du-depot/").
// En local et sur Netlify, l'app est servie à la racine.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
})
