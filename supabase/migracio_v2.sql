-- ============================================================
-- AquaCurs · Migració v2 (temporada 26-27)
-- Copia tot aquest fitxer a Supabase → SQL Editor → New query → Run.
-- NO esborra cap dada. Es pot tornar a executar sense problemes.
--
-- Afegeix:
--   · Rol "recepcio" (un únic usuari per a tota la recepció)
--   · Grups amb diversos monitors, codi visible i capacitat màxima
--   · Alumnes que només van un dia del grup (dies) i monitor que posa les notes
--   · Alumnes que van a dos grups (inscripcions_extra: surten a la llista, però les notes
--     només les posa el grup principal)
--   · Assistència per dia i grup, validada pel monitor
--   · Llista d'espera i historial de canvis de grup
-- ============================================================

-- ---------- ROL RECEPCIÓ ----------
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol in ('monitor', 'coord_nat', 'coord_gen', 'recepcio'));

-- ---------- GRUPS ----------
alter table public.groups add column if not exists codi      text not null default '';      -- codi visible (IdentG): NBMJ02…
alter table public.groups add column if not exists monitors  text[] not null default '{}';  -- tots els monitors del grup
alter table public.groups add column if not exists capacitat integer;                      -- màxim d'alumnes per dia (null = segons el nivell)
alter table public.groups add column if not exists dies_setmana text[] not null default '{}'; -- {dl,dx} | {dm,dj} | {dv} | {ds}
alter table public.groups add column if not exists hora_inici text not null default '';     -- "17:45"
alter table public.groups add column if not exists hora_fi    text not null default '';     -- "18:30"

-- Els grups antics: el monitor únic passa a la llista de monitors
update public.groups set monitors = array[monitor]
  where monitor is not null and monitor <> '' and cardinality(monitors) = 0;

-- ---------- ALUMNES ----------
alter table public.students add column if not exists dies text[];          -- null = tots els dies del grup; {dl} = només dilluns
alter table public.students add column if not exists monitor_notes text;   -- qui li posa les notes (null = el monitor del grup)
alter table public.students add column if not exists observacions text not null default '';

-- Segon grup (o més) d'un alumne: només per a llista i assistència, sense notes
create table if not exists public.inscripcions_extra (
  student_id integer not null references public.students(id) on delete cascade,
  grup_id    integer not null references public.groups(id) on update cascade on delete cascade,
  dies       text[],                                   -- null = tots els dies del grup
  created_at timestamptz not null default now(),
  primary key (student_id, grup_id)
);
create index if not exists inscripcions_extra_grup_idx on public.inscripcions_extra (grup_id);

-- Historial de canvis de grup (el desa sol un trigger)
create table if not exists public.historial_grups (
  id         bigserial primary key,
  student_id integer not null references public.students(id) on delete cascade,
  de_grup    integer,
  a_grup     integer,
  de_dies    text[],
  a_dies     text[],
  per        text,
  at         timestamptz not null default now()
);
create index if not exists historial_grups_student_idx on public.historial_grups (student_id);

-- Llista d'espera (recepció i coordinació)
create table if not exists public.llista_espera (
  id         bigserial primary key,
  nom        text not null,
  email      text not null default '',
  telefon    text not null default '',
  naixement  date,
  grup_id    integer references public.groups(id) on update cascade on delete set null,
  dies       text[],
  notes      text not null default '',
  created_at timestamptz not null default now(),
  created_by text
);

-- ---------- ASSISTÈNCIA ----------
-- Una sessió = un grup en una data. Quan el monitor valida, es desa qui ha vingut.
create table if not exists public.assistencia_sessions (
  data        date not null,
  grup_id     integer not null references public.groups(id) on update cascade on delete cascade,
  validat_per text not null,
  validat_at  timestamptz not null default now(),
  corregit_per text,
  corregit_at  timestamptz,
  primary key (data, grup_id)
);
create table if not exists public.assistencia (
  data       date not null,
  grup_id    integer not null,
  student_id integer not null references public.students(id) on delete cascade,
  present    boolean not null,
  primary key (data, grup_id, student_id),
  foreign key (data, grup_id) references public.assistencia_sessions(data, grup_id) on update cascade on delete cascade
);
create index if not exists assistencia_student_idx on public.assistencia (student_id);

-- ---------- FUNCIONS D'AJUDA ----------
create or replace function public.is_coord() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('coord_nat', 'coord_gen') from public.profiles where id = auth.uid() and actiu), false)
$$;

create or replace function public.is_recepcio() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'recepcio' from public.profiles where id = auth.uid() and actiu), false)
$$;

create or replace function public.is_monitor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'monitor' from public.profiles where id = auth.uid() and actiu), false)
$$;

-- Coordinació o recepció (gestionen alumnes de tots els grups)
create or replace function public.is_gestio() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coord() or public.is_recepcio()
$$;

-- Un grup és meu si soc el monitor principal o un dels monitors
create or replace function public.is_my_group(gid integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and public.my_name() is not null
      and (g.monitor = public.my_name() or public.my_name() = any (g.monitors))
  )
$$;

-- Un alumne és meu si és al meu grup (principal o com a inscripció extra)
create or replace function public.is_my_student(sid integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = sid and public.is_my_group(s.grup_id))
      or exists (select 1 from public.inscripcions_extra e where e.student_id = sid and public.is_my_group(e.grup_id))
$$;

-- Pot posar notes: coordinació, o el monitor del grup principal si l'alumne no té assignat un altre monitor de notes
create or replace function public.can_grade(sid integer) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coord() or exists (
    select 1 from public.students s
    where s.id = sid and public.is_my_group(s.grup_id)
      and (s.monitor_notes is null or s.monitor_notes = '' or s.monitor_notes = public.my_name())
  )
$$;

-- Avís de baixa: monitor (als seus alumnes), recepció i coordinació
create or replace function public.set_baixa(sid integer, info jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_gestio() or public.is_my_student(sid)) then
    raise exception 'No tens permís per a aquest alumne';
  end if;
  update public.students set baixa = info, updated_at = now() where id = sid;
end $$;

-- Llista d'un grup per a passar llista (qualsevol monitor, per a les substitucions).
-- Només torna el nom i els dies: ni correus ni dates de naixement.
create or replace function public.llista_grup(gid integer)
returns table (student_id integer, nom text, dies text[], extra boolean, baixa boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.nom, s.dies, false, s.baixa is not null
    from public.students s where s.grup_id = gid and auth.uid() is not null and not public.is_recepcio()
  union all
  select s.id, s.nom, e.dies, true, s.baixa is not null
    from public.inscripcions_extra e join public.students s on s.id = e.student_id
   where e.grup_id = gid and auth.uid() is not null and not public.is_recepcio()
  order by 2
$$;

-- Validar l'assistència d'un grup en una data.
-- Qualsevol monitor la pot validar una vegada (també si substitueix). Després, només coordinació la pot corregir.
create or replace function public.validar_assistencia(gid integer, dia date, presents integer[], absents integer[])
returns void language plpgsql security definer set search_path = public as $$
declare
  qui text := public.my_name();
  ja  boolean;
begin
  if qui is null or public.is_recepcio() then raise exception 'No tens permís per a passar llista'; end if;
  select exists (select 1 from public.assistencia_sessions where data = dia and grup_id = gid) into ja;
  if ja and not public.is_coord() then
    raise exception 'Aquesta llista ja està validada. Només coordinació la pot corregir.';
  end if;
  if ja then
    update public.assistencia_sessions set corregit_per = qui, corregit_at = now() where data = dia and grup_id = gid;
    delete from public.assistencia where data = dia and grup_id = gid;
  else
    insert into public.assistencia_sessions (data, grup_id, validat_per) values (dia, gid, qui);
  end if;
  insert into public.assistencia (data, grup_id, student_id, present)
    select dia, gid, x, true from unnest(coalesce(presents, '{}')) as x
    union
    select dia, gid, x, false from unnest(coalesce(absents, '{}')) as x where not (x = any (coalesce(presents, '{}')));
end $$;


-- Monitor de notes: en un grup amb dos monitors, cadascun es pot assignar (o deixar) els seus alumnes.
-- Coordinació ho pot canviar sempre.
drop function if exists public.set_monitor_notes(integer, text);
create or replace function public.set_monitor_notes(sid integer, monitor_nom text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select gr.* into g from public.groups gr join public.students s on s.grup_id = gr.id where s.id = sid;
  if not found then raise exception 'Alumne sense grup'; end if;
  if not public.is_coord() then
    if not public.is_my_group(g.id) then raise exception 'No tens permís per a aquest alumne'; end if;
    if monitor_nom is not null and monitor_nom <> public.my_name() then raise exception 'Només et pots assignar a tu mateix'; end if;
    if monitor_nom is null and exists (select 1 from public.students where id = sid and monitor_notes is not null and monitor_notes <> public.my_name()) then
      raise exception 'Aquest alumne ja té un altre monitor de notes';
    end if;
  end if;
  if monitor_nom is not null and not (monitor_nom = g.monitor or monitor_nom = any (g.monitors)) then
    raise exception 'Aquest monitor no és del grup';
  end if;
  update public.students set monitor_notes = monitor_nom, updated_at = now() where id = sid;
end $$;

-- ---------- TRIGGERS ----------
create or replace function public.log_canvi_grup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.grup_id is distinct from new.grup_id) or (old.dies is distinct from new.dies) then
    insert into public.historial_grups (student_id, de_grup, a_grup, de_dies, a_dies, per)
    values (new.id, old.grup_id, new.grup_id, old.dies, new.dies, public.my_name());
  end if;
  return new;
end $$;
drop trigger if exists students_log_grup on public.students;
create trigger students_log_grup after update on public.students for each row execute function public.log_canvi_grup();

-- ---------- PERMISOS (Row Level Security) ----------
alter table public.inscripcions_extra   enable row level security;
alter table public.historial_grups      enable row level security;
alter table public.llista_espera        enable row level security;
alter table public.assistencia_sessions enable row level security;
alter table public.assistencia          enable row level security;

-- Grups: tots els usuaris els poden veure (no tenen dades personals); només coordinació els modifica
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated using (true);
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups for all to authenticated
  using (public.is_coord()) with check (public.is_coord());

-- Alumnes
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (public.is_gestio() or public.is_my_student(id));
drop policy if exists students_insert on public.students;
create policy students_insert on public.students for insert to authenticated
  with check (public.is_gestio() or public.is_my_group(grup_id));
drop policy if exists students_update on public.students;
create policy students_update on public.students for update to authenticated
  using (public.is_gestio()) with check (public.is_gestio());
drop policy if exists students_delete on public.students;
create policy students_delete on public.students for delete to authenticated
  using (public.is_coord());

-- Inscripcions extra: les gestiona recepció i coordinació; el monitor veu les dels seus grups
drop policy if exists inscripcions_select on public.inscripcions_extra;
create policy inscripcions_select on public.inscripcions_extra for select to authenticated
  using (public.is_gestio() or public.is_my_group(grup_id));
drop policy if exists inscripcions_write on public.inscripcions_extra;
create policy inscripcions_write on public.inscripcions_extra for all to authenticated
  using (public.is_gestio()) with check (public.is_gestio());

-- Avaluacions: les veuen els monitors de l'alumne; només qui pot posar notes les modifica. Recepció no.
drop policy if exists evaluations_select on public.evaluations;
create policy evaluations_select on public.evaluations for select to authenticated
  using (public.is_coord() or public.is_my_student(student_id));
drop policy if exists evaluations_insert on public.evaluations;
create policy evaluations_insert on public.evaluations for insert to authenticated
  with check (public.can_grade(student_id));
drop policy if exists evaluations_update on public.evaluations;
create policy evaluations_update on public.evaluations for update to authenticated
  using (public.can_grade(student_id)) with check (public.can_grade(student_id));

-- Historial: només lectura per a coordinació i recepció (l'escriu el trigger)
drop policy if exists historial_select on public.historial_grups;
create policy historial_select on public.historial_grups for select to authenticated using (public.is_gestio());

-- Llista d'espera
drop policy if exists espera_all on public.llista_espera;
create policy espera_all on public.llista_espera for all to authenticated
  using (public.is_gestio()) with check (public.is_gestio());

-- Assistència: coordinació ho veu tot; el monitor, la dels seus grups i les llistes que ha validat ell.
-- S'escriu només amb validar_assistencia().
drop policy if exists asist_ses_select on public.assistencia_sessions;
create policy asist_ses_select on public.assistencia_sessions for select to authenticated
  using (public.is_coord() or public.is_my_group(grup_id) or validat_per = public.my_name());
drop policy if exists asist_select on public.assistencia;
create policy asist_select on public.assistencia for select to authenticated
  using (public.is_coord() or public.is_my_group(grup_id)
         or exists (select 1 from public.assistencia_sessions x where x.data = assistencia.data and x.grup_id = assistencia.grup_id and x.validat_per = public.my_name()));

-- Qui pot cridar què
revoke all on public.inscripcions_extra, public.historial_grups, public.llista_espera,
              public.assistencia_sessions, public.assistencia from anon;
grant select, insert, update, delete on public.inscripcions_extra, public.llista_espera to authenticated;
grant select on public.historial_grups, public.assistencia_sessions, public.assistencia to authenticated;
grant usage on sequence public.llista_espera_id_seq to authenticated;

revoke execute on function public.llista_grup(integer) from public;
grant execute on function public.llista_grup(integer) to authenticated;
revoke execute on function public.validar_assistencia(integer, date, integer[], integer[]) from public;
grant execute on function public.validar_assistencia(integer, date, integer[], integer[]) to authenticated;
revoke execute on function public.set_baixa(integer, jsonb) from public;
grant execute on function public.set_baixa(integer, jsonb) to authenticated;
revoke execute on function public.set_monitor_notes(integer, text) from public;
grant execute on function public.set_monitor_notes(integer, text) to authenticated;
