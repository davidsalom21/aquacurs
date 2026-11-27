-- ============================================================
-- AquaCurs · Migració v4: missatges interns entre usuaris
-- Copia aquest fitxer a Supabase → SQL Editor → New query → Run. No esborra res.
-- Cada missatge té un remitent i un o més destinataris. Queda guardat per als dos:
-- el remitent el veu a «Enviats» i cada destinatari a la seua safata d'entrada.
-- ============================================================
create table if not exists public.missatges (
  id         bigserial primary key,
  de         uuid not null references public.profiles(id) on delete cascade,
  de_nom     text not null,
  assumpte   text not null default '',
  text       text not null,
  resposta_a bigint references public.missatges(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.missatges_destinataris (
  missatge_id bigint not null references public.missatges(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  nom         text not null,
  llegit_at   timestamptz,
  primary key (missatge_id, user_id)
);
create index if not exists missatges_dest_user_idx on public.missatges_destinataris (user_id);
create index if not exists missatges_de_idx on public.missatges (de);

alter table public.missatges enable row level security;
alter table public.missatges_destinataris enable row level security;

-- Un missatge el veuen qui l'envia i qui el rep (funcions auxiliars per a no fer polítiques circulars)
create or replace function public.soc_destinatari(mid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.missatges_destinataris d where d.missatge_id = mid and d.user_id = auth.uid())
$$;
create or replace function public.soc_remitent(mid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.missatges m where m.id = mid and m.de = auth.uid())
$$;
drop policy if exists missatges_select on public.missatges;
create policy missatges_select on public.missatges for select to authenticated
  using (de = auth.uid() or public.soc_destinatari(id));
drop policy if exists dest_select on public.missatges_destinataris;
create policy dest_select on public.missatges_destinataris for select to authenticated
  using (user_id = auth.uid() or public.soc_remitent(missatge_id));

-- Llista de persones a qui es pot escriure (només nom i rol dels comptes actius)
create or replace function public.llista_usuaris()
returns table (id uuid, nom text, rol text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nom, p.rol from public.profiles p where p.actiu and auth.uid() is not null order by p.nom
$$;

-- Enviar: el remitent és sempre l'usuari que ha entrat
create or replace function public.enviar_missatge(destinataris uuid[], assumpte text, cos text, resposta bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare me public.profiles; mid bigint;
begin
  select * into me from public.profiles where id = auth.uid() and actiu;
  if not found then raise exception 'Has d''entrar amb el teu compte per a enviar missatges'; end if;
  if coalesce(trim(cos), '') = '' then raise exception 'El missatge no pot estar buit'; end if;
  if coalesce(cardinality(destinataris), 0) = 0 then raise exception 'Tria almenys una persona'; end if;
  insert into public.missatges (de, de_nom, assumpte, text, resposta_a)
    values (me.id, me.nom, left(coalesce(trim(assumpte), ''), 200), left(cos, 5000), resposta) returning id into mid;
  insert into public.missatges_destinataris (missatge_id, user_id, nom)
    select mid, p.id, p.nom from public.profiles p where p.id = any (destinataris) and p.actiu;
  if not found then raise exception 'Cap destinatari vàlid'; end if;
  return mid;
end $$;

-- Marcar com a llegit (només els meus)
create or replace function public.marcar_llegit(mid bigint)
returns void language sql security definer set search_path = public as $$
  update public.missatges_destinataris set llegit_at = coalesce(llegit_at, now())
   where missatge_id = mid and user_id = auth.uid()
$$;

revoke all on public.missatges, public.missatges_destinataris from anon;
grant select on public.missatges, public.missatges_destinataris to authenticated;
revoke execute on function public.llista_usuaris() from public;
grant execute on function public.llista_usuaris() to authenticated;
revoke execute on function public.enviar_missatge(uuid[], text, text, bigint) from public;
grant execute on function public.enviar_missatge(uuid[], text, text, bigint) to authenticated;
revoke execute on function public.marcar_llegit(bigint) from public;
grant execute on function public.marcar_llegit(bigint) to authenticated;
