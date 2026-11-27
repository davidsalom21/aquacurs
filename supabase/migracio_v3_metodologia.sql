-- ============================================================
-- AquaCurs · Migració v3: contingut de metodologia (privat)
-- Copia aquest fitxer a Supabase → SQL Editor → New query → Run. No esborra res.
-- El contingut (llibre de metodologia, calendari d'activitats, sessions i banc d'exercicis)
-- es carrega a part amb un altre script que NO es puja a GitHub.
-- ============================================================
create table if not exists public.metodologia (
  clau       text primary key,
  contingut  jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.metodologia enable row level security;

-- El llegeixen tots els usuaris amb compte (monitors, coordinació i recepció); només coordinació el modifica
drop policy if exists metodologia_select on public.metodologia;
create policy metodologia_select on public.metodologia for select to authenticated using (true);
drop policy if exists metodologia_write on public.metodologia;
create policy metodologia_write on public.metodologia for all to authenticated
  using (public.is_coord()) with check (public.is_coord());

revoke all on public.metodologia from anon;
grant select, insert, update, delete on public.metodologia to authenticated;
