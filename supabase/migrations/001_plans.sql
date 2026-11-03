-- Une ligne par utilisateur : son plan de trésorerie complet (JSON).
create table public.plans (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- La version est toujours l'heure du serveur, pas celle de l'appareil.
create function public.plans_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger plans_touch before insert or update on public.plans
for each row execute function public.plans_touch();

-- Chaque utilisateur ne peut lire et écrire QUE sa propre ligne.
alter table public.plans enable row level security;

create policy "lecture de son plan" on public.plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "création de son plan" on public.plans
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "modification de son plan" on public.plans
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "suppression de son plan" on public.plans
  for delete to authenticated using ((select auth.uid()) = user_id);
