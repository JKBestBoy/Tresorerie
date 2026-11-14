-- Relevé d'origine de chaque opération : permet de consulter, supprimer ou remplacer un relevé importé.
alter table public.transactions add column if not exists import_id text;
alter table public.transactions add column if not exists source text; -- nom du fichier importé
create index if not exists transactions_user_import on public.transactions (user_id, import_id);
