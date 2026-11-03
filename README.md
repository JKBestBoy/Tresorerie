# Simulateur de trésorerie

Web app (PWA) en français pour projeter son solde bancaire sur 12/24 mois.
Vite + React + TypeScript + Tailwind + Recharts. Données stockées localement (IndexedDB), pas de backend.

- `npm run dev` : lancer en local
- `npm test` : tests du moteur de calcul (`src/domain/`)
- Déploiement automatique à chaque push sur `main` (`.github/workflows/deploy.yml`, ou `netlify.toml`).
