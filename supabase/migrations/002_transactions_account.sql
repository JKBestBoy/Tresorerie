-- Compte d'origine de chaque opération importée (bunq, Banque Postale…), pour gérer plusieurs comptes.
alter table public.transactions add column if not exists account text;
