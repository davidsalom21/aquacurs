-- ============================================================
-- AquaCurs · Base de dades (Supabase)
-- Copia tot aquest fitxer a Supabase → SQL Editor → New query → Run.
-- Es pot tornar a executar: no esborra dades existents.
-- ============================================================

-- ---------- TAULES ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nom        text not null unique,
  rol        text not null check (rol in ('monitor', 'coord_nat', 'coord_gen')),
  login      text not null unique,            -- email intern: nom@usuaris.aquacurs.com
  actiu      boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id         integer primary key,             -- codi del grup (GrupID de l'Excel)
  nivell     text not null,
  dia        text not null default '',
  hora       text not null default '',
  monitor    text,                            -- nom del monitor (= profiles.nom); null = sense assignar
  updated_at timestamptz not null default now()
);

-- Els alumnes de l'Excel porten el seu codi; els que s'afegeixen a mà reben un codi a partir de 900001
create sequence if not exists public.student_manual_seq start 900001;

create table if not exists public.students (
  id         integer primary key default nextval('public.student_manual_seq'),
  nom        text not null,
  email      text not null default '',
  naixement  date,
  grup_id    integer references public.groups(id) on update cascade on delete set null,
  baixa      jsonb,                           -- avís de baixa del monitor: { at, per, motiu }
  updated_at timestamptz not null default now()
);
create index if not exists students_grup_idx on public.students (grup_id);

create table if not exists public.evaluations (
  season     text not null default '25-26',
  student_id integer not null references public.students(id) on delete cascade,
  scores     jsonb not null default '{}'::jsonb,
  override   text,                            -- nivell recomanat triat a mà
  comment    text,                            -- null = observació automàtica
  ready      boolean not null default false,  -- el monitor ha marcat el diploma com a llest
  ready_at   timestamptz,
  sent_at    timestamptz,                     -- coordinació l'ha enviat per correu
  sent_to    text,
  monitor    text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (season, student_id)
);

-- ---------- FUNCIONS D'AJUDA (per als permisos) ----------
create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select nom from public.profiles where id = auth.uid() and actiu
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid() and actiu
$$;

create or replace function public.is_coord() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('coord_nat', 'coord_gen') from public.profiles where id = auth.uid() and actiu), false)
$$;

create or replace function public.is_my_group(gid integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = gid and g.monitor is not null and g.monitor = public.my_name())
$$;

create or replace function public.is_my_student(sid integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = sid and public.is_my_group(s.grup_id))
$$;

-- Llista de noms per a la pantalla d'entrada (abans d'iniciar sessió): només nom, rol i login intern
create or replace function public.login_list()
returns table (nom text, rol text, login text)
language sql stable security definer set search_path = public as $$
  select nom, rol, login from public.profiles where actiu order by nom
$$;

-- Avís de baixa: el monitor el pot posar o llevar només als seus alumnes (coordinació, a tots)
create or replace function public.set_baixa(sid integer, info jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_coord() or public.is_my_student(sid)) then
    raise exception 'No tens permís per a aquest alumne';
  end if;
  update public.students set baixa = info, updated_at = now() where id = sid;
end $$;

-- ---------- TRIGGERS ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists groups_touch on public.groups;
create trigger groups_touch before update on public.groups for each row execute function public.touch_updated_at();
drop trigger if exists students_touch on public.students;
create trigger students_touch before update on public.students for each row execute function public.touch_updated_at();

-- Els monitors no poden marcar un diploma com a enviat (només coordinació)
create or replace function public.protect_evaluation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if auth.uid() is not null and not public.is_coord() then
    if tg_op = 'INSERT' then
      new.sent_at := null; new.sent_to := null;
    else
      new.sent_at := old.sent_at; new.sent_to := old.sent_to;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists evaluations_protect on public.evaluations;
create trigger evaluations_protect before insert or update on public.evaluations for each row execute function public.protect_evaluation();

-- ---------- PERMISOS (Row Level Security) ----------
alter table public.profiles    enable row level security;
alter table public.groups      enable row level security;
alter table public.students    enable row level security;
alter table public.evaluations enable row level security;

-- Perfils: cadascú veu el seu; coordinació els veu tots. Es creen i modifiquen des del servidor.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_coord());

-- Grups: el monitor veu els seus; coordinació ho veu i ho gestiona tot
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_coord() or (monitor is not null and monitor = public.my_name()));
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups for all to authenticated
  using (public.is_coord()) with check (public.is_coord());

-- Alumnes: el monitor veu i pot afegir alumnes als seus grups; editar i esborrar, només coordinació
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (public.is_coord() or public.is_my_group(grup_id));
drop policy if exists students_insert on public.students;
create policy students_insert on public.students for insert to authenticated
  with check (public.is_coord() or public.is_my_group(grup_id));
drop policy if exists students_update on public.students;
create policy students_update on public.students for update to authenticated
  using (public.is_coord()) with check (public.is_coord());
drop policy if exists students_delete on public.students;
create policy students_delete on public.students for delete to authenticated
  using (public.is_coord());

-- Avaluacions: el monitor les dels seus alumnes; coordinació totes
drop policy if exists evaluations_select on public.evaluations;
create policy evaluations_select on public.evaluations for select to authenticated
  using (public.is_coord() or public.is_my_student(student_id));
drop policy if exists evaluations_insert on public.evaluations;
create policy evaluations_insert on public.evaluations for insert to authenticated
  with check (public.is_coord() or public.is_my_student(student_id));
drop policy if exists evaluations_update on public.evaluations;
create policy evaluations_update on public.evaluations for update to authenticated
  using (public.is_coord() or public.is_my_student(student_id))
  with check (public.is_coord() or public.is_my_student(student_id));
drop policy if exists evaluations_delete on public.evaluations;
create policy evaluations_delete on public.evaluations for delete to authenticated
  using (public.is_coord());

-- Qui pot cridar què
revoke all on public.profiles, public.groups, public.students, public.evaluations from anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.groups, public.students, public.evaluations to authenticated;
grant usage on sequence public.student_manual_seq to authenticated;
revoke execute on function public.login_list() from public;
grant execute on function public.login_list() to anon, authenticated;
revoke execute on function public.set_baixa(integer, jsonb) from public;
grant execute on function public.set_baixa(integer, jsonb) to authenticated;

-- ---------- GRUPS INICIALS (temporada 25-26) ----------
-- Si ja existeixen no es toquen. L'Excel de grups els actualitzarà.
insert into public.groups (id, nivell, dia, hora, monitor) values
  (6252, 'Infants Baix', 'Dilluns i dimecres', '17:45h', 'David'),
  (6264, 'Nadons Alt', 'Dilluns i dimecres', '18:30h', 'David'),
  (6283, 'Xiquets Iniciació-Mitjà', 'Dilluns i dimecres', '19:15h', 'David'),
  (6258, 'Infants Mig-Alt', 'Dimarts i dijous', '17:45h', 'David'),
  (6286, 'Xiquets Iniciació-Mitjà', 'Dimarts i dijous', '19:15h', 'David'),
  (6261, 'Infants Mig-Alt', 'Dilluns i dimecres', '17:00h', 'Aitor'),
  (6253, 'Infants Mig-Alt', 'Dilluns i dimecres', '18:30h', 'Aitor'),
  (6280, 'Xiquets Mitjà-Perfeccionament', 'Dilluns i dimecres', '19:15h', 'Aitor'),
  (6276, 'Xiquets Iniciació-Mitjà', 'Dilluns i dimecres', '17:45h', null),
  (6254, 'Infants Baix', 'Dimarts i dijous', '17:45h', null),
  (6277, 'Xiquets Mitjà-Perfeccionament', 'Dimarts i dijous', '18:30h', 'Dave'),
  (6278, 'Xiquets Iniciació-Mitjà', 'Dimarts i dijous', '17:00h', 'Dave'),
  (6301, 'Infants Baix', 'Dissabte', '10:00h', 'Alicia'),
  (6290, 'Nadons Pares', 'Dimarts i dijous', '18:30h', 'Guillem'),
  (6291, 'Xiquets Mitjà-Perfeccionament', 'Dilluns i dimecres', '20:00h', 'Guillem'),
  (6292, 'Infants Baix', 'Dimarts i dijous', '18:30h', 'Vanesa'),
  (6293, 'Xiquets Iniciació-Mitjà', 'Dilluns i dimecres', '20:00h', 'Vanesa')
on conflict (id) do nothing;
