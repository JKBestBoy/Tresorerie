# Simulateur de trésorerie

Web app (PWA) en français pour projeter son solde bancaire sur 12/24 mois.
Vite + React + TypeScript + Tailwind + Recharts. Données stockées localement (IndexedDB), pas de backend.

- `npm run dev` : lancer en local
- `npm test` : tests du moteur de calcul (`src/domain/`)
- Déploiement automatique à chaque push sur `main` (`.github/workflows/deploy.yml`, ou `netlify.toml`).

## Base de données (Supabase)

- Projet Supabase `tresorerie` (région Paris). URL et clé publique dans `src/sync/config.ts` (publiques par conception).
- Table `plans` : une ligne par utilisateur, protégée par des règles RLS (`supabase/migrations/001_plans.sql`).
- L'app garde une copie locale (IndexedDB) pour fonctionner hors ligne et synchronise à l'enregistrement.
