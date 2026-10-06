-- =====================================================================
--  SIRA PROPIEDADES: configuración de la base de datos en Supabase
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO esto → Run.
--  Se puede volver a ejecutar sin perder datos (sirve para aplicar mejoras).
--
--  Perfiles:
--    dueno      → todo: publicar, borrar, equipo, historial, UF
--    gerente    → crear/editar cualquier propiedad, publicar, cambiar estados, UF, ver equipo e historial. No borra.
--    corredor   → publica directo SUS propiedades y les cambia el estado; ve las de otros sin tocarlas.
--                 Dueño y gerente pueden editar las del corredor. Borra solo sus borradores.
--    asistente  → crea propiedades que quedan "En revisión"; edita/borra solo las suyas mientras no estén publicadas
--    lectura    → ve todo el stock interno, no cambia nada
--    pendiente  → recién registrado, sin acceso hasta que el dueño le asigne un perfil
--  La primera persona que se registra queda como DUEÑO automáticamente.
-- =====================================================================

-- ---------- 1. Perfiles del equipo ----------
create table if not exists public.perfiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  email   text,
  nombre  text not null default '',
  rol     text not null default 'pendiente'
          check (rol in ('dueno','gerente','corredor','asistente','lectura','pendiente')),
  activo  boolean not null default true,
  creado  timestamptz not null default now()
);

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('dueno','gerente','corredor','asistente','lectura','pendiente'));

/* perfil efectivo de quien hace la consulta (los desactivados no tienen permisos) */
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when activo then rol else 'pendiente' end
                   from public.perfiles where id = auth.uid()), 'ninguno')
$$;

/* al registrarse alguien: se crea su perfil. El primero es el dueño. */
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''),
          case when exists (select 1 from public.perfiles where rol = 'dueno') then 'pendiente' else 'dueno' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.nuevo_usuario();

/* reglas de cambio de perfil que no se pueden expresar solo con políticas */
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := public.mi_rol();
begin
  if auth.uid() is null then return new; end if;            -- cambios hechos desde el panel de Supabase
  new.id := old.id; new.email := old.email; new.creado := old.creado;
  if r <> 'dueno' then                                      -- cada uno solo puede cambiar su nombre
    new.rol := old.rol; new.activo := old.activo;
  elsif new.id = auth.uid() and (new.rol <> 'dueno' or not new.activo) then
    raise exception 'No puedes quitarte el perfil de dueño ni desactivarte a ti mismo.';
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfil on public.perfiles;
create trigger proteger_perfil before update on public.perfiles
  for each row execute function public.proteger_perfil();

alter table public.perfiles enable row level security;
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.mi_rol() in ('dueno','gerente'));
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update to authenticated
  using (id = auth.uid() or public.mi_rol() = 'dueno')
  with check (id = auth.uid() or public.mi_rol() = 'dueno');

-- ---------- 2. Propiedades ----------
create sequence if not exists public.codigo_seq;
create table if not exists public.propiedades (
  id              uuid primary key default gen_random_uuid(),
  codigo          text unique not null default '',
  estado          text not null default 'revision'
                  check (estado in ('disponible','reservada','vendida','arrendada','pausada','revision')),
  datos           jsonb not null default '{}'::jsonb,
  creada          timestamptz not null default now(),
  creada_por      uuid references public.perfiles(id) on delete set null,
  actualizada     timestamptz not null default now(),
  actualizada_por uuid references public.perfiles(id) on delete set null
);
create index if not exists propiedades_estado on public.propiedades (estado);

/* código SIRA-0001… lo pone la base (nunca se repite) y nadie puede falsear autor ni fechas */
create or replace function public.preparar_propiedad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.codigo := 'SIRA-' || lpad(nextval('public.codigo_seq')::text, 4, '0');
    new.creada := now();
    new.creada_por := auth.uid();
  elsif auth.uid() is not null then          -- cambios desde el panel: autor, código y fecha no se tocan
    new.id := old.id; new.codigo := old.codigo; new.creada := old.creada; new.creada_por := old.creada_por;
  end if;
  if (new.datos->>'operacion') = 'Arriendo' and new.estado = 'vendida' then
    raise exception 'Una propiedad en arriendo no puede quedar como vendida (usa "arrendada").';
  elsif (new.datos->>'operacion') = 'Venta' and new.estado = 'arrendada' then
    raise exception 'Una propiedad en venta no puede quedar como arrendada (usa "vendida").';
  end if;
  new.actualizada := clock_timestamp();
  new.actualizada_por := auth.uid();
  return new;
end $$;
drop trigger if exists preparar_propiedad on public.propiedades;
create trigger preparar_propiedad before insert or update on public.propiedades
  for each row execute function public.preparar_propiedad();

alter table public.propiedades enable row level security;
drop policy if exists prop_ver on public.propiedades;
create policy prop_ver on public.propiedades for select to anon, authenticated
  using (estado in ('disponible','reservada','vendida','arrendada')
         or public.mi_rol() in ('dueno','gerente','corredor','asistente','lectura'));
drop policy if exists prop_crear on public.propiedades;
create policy prop_crear on public.propiedades for insert to authenticated
  with check (public.mi_rol() in ('dueno','gerente','corredor')
              or (public.mi_rol() = 'asistente' and estado in ('revision','pausada')));
drop policy if exists prop_editar on public.propiedades;
create policy prop_editar on public.propiedades for update to authenticated
  using (public.mi_rol() in ('dueno','gerente')
         or (public.mi_rol() = 'corredor' and creada_por = auth.uid())
         or (public.mi_rol() = 'asistente' and creada_por = auth.uid() and estado in ('revision','pausada')))
  with check (public.mi_rol() in ('dueno','gerente')
         or (public.mi_rol() = 'corredor' and creada_por = auth.uid())
         or (public.mi_rol() = 'asistente' and creada_por = auth.uid() and estado in ('revision','pausada')));
drop policy if exists prop_borrar on public.propiedades;
create policy prop_borrar on public.propiedades for delete to authenticated
  using (public.mi_rol() = 'dueno'
         or (public.mi_rol() in ('corredor','asistente') and creada_por = auth.uid() and estado in ('revision','pausada')));

-- ---------- 3. Historial (quién hizo qué) ----------
create table if not exists public.historial (
  id           bigint generated always as identity primary key,
  cuando       timestamptz not null default now(),
  quien        uuid,
  quien_nombre text,
  accion       text not null,
  codigo       text,
  detalle      text
);
create or replace function public.anotar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  yo text := coalesce((select nullif(nombre,'') from public.perfiles where id = auth.uid()),
                      (select email from public.perfiles where id = auth.uid()), 'Sistema');
  tit text;
begin
  if tg_table_name = 'propiedades' then
    if tg_op = 'INSERT' then
      tit := coalesce(new.datos->>'tipo','') || ' en ' || coalesce(new.datos->>'comuna','');
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Creó', new.codigo, tit || ' · ' || new.estado);
    elsif tg_op = 'DELETE' then
      tit := coalesce(old.datos->>'tipo','') || ' en ' || coalesce(old.datos->>'comuna','');
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Eliminó', old.codigo, tit);
    elsif new.estado is distinct from old.estado then
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Cambió estado', new.codigo, old.estado || ' → ' || new.estado);
      if new.datos is distinct from old.datos then
        insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Editó', new.codigo, null);
      end if;
    elsif new.datos is distinct from old.datos then
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Editó',
        new.codigo, case when (new.datos->'precio') is distinct from (old.datos->'precio')
                         then 'Precio: ' || coalesce(old.datos->>'precio','—') || ' → ' || coalesce(new.datos->>'precio','—') end);
    end if;
  elsif tg_table_name = 'perfiles' then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo then
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Cambió perfil', null,
        coalesce(nullif(new.nombre,''), new.email) || ': ' || old.rol || case when old.activo then '' else ' (inactivo)' end
        || ' → ' || new.rol || case when new.activo then '' else ' (inactivo)' end);
    end if;
  elsif tg_table_name = 'config' then
    insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Actualizó ' || new.clave, null, new.valor::text);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists anotar on public.propiedades;
create trigger anotar after insert or update or delete on public.propiedades for each row execute function public.anotar();
drop trigger if exists anotar on public.perfiles;
create trigger anotar after update on public.perfiles for each row execute function public.anotar();

alter table public.historial enable row level security;
drop policy if exists historial_ver on public.historial;
create policy historial_ver on public.historial for select to authenticated
  using (public.mi_rol() in ('dueno','gerente'));

-- ---------- 4. Configuración (valor UF) ----------
create table if not exists public.config (
  clave       text primary key,
  valor       jsonb,
  actualizada timestamptz not null default now()
);
insert into public.config (clave, valor) values ('uf', '{"valor": 39500, "fecha": null}') on conflict (clave) do nothing;
drop trigger if exists anotar on public.config;
create trigger anotar after update on public.config for each row execute function public.anotar();
alter table public.config enable row level security;
drop policy if exists config_ver on public.config;
create policy config_ver on public.config for select to anon, authenticated using (true);
drop policy if exists config_editar on public.config;
create policy config_editar on public.config for update to authenticated
  using (public.mi_rol() in ('dueno','gerente')) with check (public.mi_rol() in ('dueno','gerente'));

-- ---------- 5. Permisos de acceso a tablas ----------
revoke all on public.perfiles, public.propiedades, public.historial, public.config from anon, authenticated;
grant select on public.propiedades, public.config to anon;
grant select, insert, update, delete on public.propiedades to authenticated;
grant select, update on public.perfiles, public.config to authenticated;
grant select on public.historial to authenticated;
grant execute on function public.mi_rol() to anon, authenticated;

-- ---------- 6. Fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists fotos_subir on storage.objects;
create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.mi_rol() in ('dueno','gerente','corredor','asistente'));
drop policy if exists fotos_ver on storage.objects;
create policy fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.mi_rol() in ('dueno','gerente','corredor','asistente','lectura'));
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (public.mi_rol() in ('dueno','gerente')
         or (public.mi_rol() in ('corredor','asistente') and owner_id = auth.uid()::text)));
