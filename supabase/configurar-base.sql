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
--  Después, el registro de cuentas nuevas está CERRADO hasta que el dueño o el
--  gerente lo abran desde la pestaña Equipo.
--
--  También guarda (todo privado, nunca visible en el sitio público):
--    checklist  → seguimiento del proceso de venta/arriendo de cada propiedad
--    privados   → datos del propietario, honorarios y mandato de cada propiedad
--    contratos, pagos, gastos → administración mensual de arriendos
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

alter table public.perfiles drop constraint if exists perfiles_nombre_largo;
alter table public.perfiles add constraint perfiles_nombre_largo check (char_length(nombre) <= 80) not valid;
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('dueno','gerente','corredor','asistente','lectura','pendiente'));

/* perfil efectivo de quien hace la consulta (los desactivados no tienen permisos) */
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select case when activo then rol else 'pendiente' end
                   from public.perfiles where id = auth.uid()), 'ninguno')
$$;

/* al registrarse alguien: se crea su perfil. El primero es el dueño. */
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare primero boolean;
begin
  perform pg_advisory_xact_lock(424242);                    -- dos registros al mismo tiempo no pueden ser ambos "el primero"
  primero := not exists (select 1 from public.perfiles);
  /* solo la PRIMERA cuenta de todas entra sin registro abierto (y queda como dueño).
     Si algún día el dueño se borra, nadie más se vuelve dueño solo: se arregla desde Supabase. */
  if not primero
     and not coalesce((select (valor->>'abierto')::boolean from public.config where clave = 'registro'), false) then
    raise exception 'REGISTRO_CERRADO: el registro de nuevos integrantes está cerrado.';
  end if;
  insert into public.perfiles (id, email, nombre, rol)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'nombre', ''), 80),
          case when primero then 'dueno' else 'pendiente' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.nuevo_usuario();

/* reglas de cambio de perfil que no se pueden expresar solo con políticas */
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
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
/* ¿se publicó alguna vez? (corredores y asistentes solo eliminan lo que nunca salió al sitio) */
alter table public.propiedades add column if not exists publicada boolean not null default false;
update public.propiedades set publicada = true where not publicada and estado in ('disponible','reservada','vendida','arrendada');

/* código SIRA-0001… lo pone la base (nunca se repite) y nadie puede falsear autor ni fechas */
create or replace function public.preparar_propiedad() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.codigo := 'SIRA-' || lpad(nextval('public.codigo_seq')::text, 4, '0');
    new.creada := now();
    new.creada_por := auth.uid();
    new.publicada := false;
  elsif auth.uid() is not null then          -- cambios desde el panel: autor, código y fecha no se tocan
    new.id := old.id; new.codigo := old.codigo; new.creada := old.creada; new.creada_por := old.creada_por;
    new.publicada := old.publicada;
  end if;
  if new.estado in ('disponible','reservada','vendida','arrendada') then new.publicada := true; end if;
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
create policy prop_ver on public.propiedades for select to authenticated
  using (public.mi_rol() in ('dueno','gerente','corredor','asistente','lectura'));
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
         or (public.mi_rol() in ('corredor','asistente') and creada_por = auth.uid() and estado in ('revision','pausada') and not publicada));

/* lo que ve el público: solo lo publicado y sin la dirección exacta si no se pidió mostrarla */
create or replace view public.publicas as
  select codigo, estado, creada,
         case when coalesce((datos->>'mapaExacto')::boolean, false) then datos else datos - 'direccion' - 'lat' - 'lng' end as datos
  from public.propiedades
  where estado in ('disponible','reservada','vendida','arrendada');

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
language plpgsql security definer set search_path = public, pg_temp as $$
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
    insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Actualizó ' || new.clave, null,
      case when new.clave in ('plantillas','portales') then null else new.valor::text end);
  elsif tg_table_name = 'contratos' then
    if tg_op = 'INSERT' then
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Creó contrato', null, coalesce(new.datos->>'nombre',''));
    elsif tg_op = 'DELETE' then
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Eliminó contrato', null, coalesce(old.datos->>'nombre',''));
    elsif (new.datos->'monto') is distinct from (old.datos->'monto') then
      insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo, 'Cambió arriendo', null,
        coalesce(new.datos->>'nombre','') || ': ' || coalesce(old.datos->>'monto','—') || ' → ' || coalesce(new.datos->>'monto','—'));
    end if;
  elsif tg_table_name = 'pagos' and exists (select 1 from public.contratos where id = coalesce(new.contrato_id, old.contrato_id)) then
    -- (si el contrato se eliminó, sus pagos se borran sin llenar el historial)
    insert into historial(quien, quien_nombre, accion, codigo, detalle) values (auth.uid(), yo,
      case tg_op when 'DELETE' then 'Anuló pago' else 'Registró pago' end, null,
      coalesce((select datos->>'nombre' from public.contratos where id = coalesce(new.contrato_id, old.contrato_id)),'')
      || ' · ' || to_char(coalesce(new.periodo, old.periodo), 'MM/YYYY')
      || case when tg_op = 'DELETE' then '' else ' · $' || coalesce(new.monto_pagado, 0)::text end);
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
insert into public.config (clave, valor) values ('registro', '{"abierto": false}') on conflict (clave) do nothing;
insert into public.config (clave, valor) values ('plantillas', 'null') on conflict (clave) do nothing;
insert into public.config (clave, valor) values ('portales',
  '[{"nombre":"Instagram","url":"https://www.instagram.com/sira_propiedades/"},{"nombre":"Facebook","url":"https://www.facebook.com/profile.php?id=61574322721504"},{"nombre":"Mercado Libre","url":"https://inmuebles.mercadolibre.cl/"}]')
  on conflict (clave) do nothing;
drop trigger if exists anotar on public.config;
create trigger anotar after update on public.config for each row execute function public.anotar();
alter table public.config enable row level security;
drop policy if exists config_ver on public.config;
create policy config_ver on public.config for select to anon, authenticated
  using (clave in ('uf','registro') or public.mi_rol() in ('dueno','gerente','corredor','asistente','lectura'));
drop policy if exists config_editar on public.config;
create policy config_editar on public.config for update to authenticated
  using (public.mi_rol() in ('dueno','gerente')) with check (public.mi_rol() in ('dueno','gerente'));
/* la lista de portales solo acepta enlaces web normales (nada de "javascript:") */
create or replace function public.revisar_config() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.clave = 'portales' and (jsonb_typeof(new.valor) <> 'array'
     or exists (select 1 from jsonb_array_elements(new.valor) e where coalesce(e->>'url','') !~* '^https?://')) then
    raise exception 'Cada portal necesita un enlace que empiece con https://';
  end if;
  return new;
end $$;
drop trigger if exists revisar_config on public.config;
create trigger revisar_config before update on public.config for each row execute function public.revisar_config();

-- ---------- 5. Permisos de acceso a tablas ----------
revoke all on public.perfiles, public.propiedades, public.historial, public.config from anon, authenticated;
grant select on public.publicas, public.config to anon, authenticated;
grant select, insert, update, delete on public.propiedades to authenticated;
grant select, update on public.perfiles, public.config to authenticated;
grant select on public.historial to authenticated;
grant execute on function public.mi_rol() to anon, authenticated;

/* la pantalla de ingreso pregunta si puede mostrar "Crear cuenta" (sin revelar quién está) */
create or replace function public.registro_abierto() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.perfiles where rol = 'dueno')
      or coalesce((select (valor->>'abierto')::boolean from public.config where clave = 'registro'), false)
$$;
grant execute on function public.registro_abierto() to anon, authenticated;

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

-- ---------- 7. Seguimiento del proceso (checklist) ----------
/* una fila por paso marcado. Los pasos vienen de la plantilla (config 'plantillas');
   los pasos propios de una propiedad llevan su texto aquí mismo. */
create table if not exists public.checklist (
  propiedad_id    uuid not null references public.propiedades(id) on delete cascade,
  operacion       text not null check (operacion in ('venta','arriendo')),
  paso            text not null check (length(paso) between 1 and 60),
  estado          text not null default 'pendiente' check (estado in ('pendiente','hecho','na')),
  texto           text check (texto is null or length(texto) <= 300),
  etapa           text check (etapa is null or length(etapa) <= 60),
  nota            text check (nota is null or length(nota) <= 500),
  actualizada     timestamptz not null default now(),
  actualizada_por uuid references public.perfiles(id) on delete set null,
  primary key (propiedad_id, operacion, paso)
);
create or replace function public.sello_cambio() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.actualizada := clock_timestamp();
  new.actualizada_por := coalesce(auth.uid(), new.actualizada_por);
  return new;
end $$;
drop trigger if exists sello_cambio on public.checklist;
create trigger sello_cambio before insert or update on public.checklist
  for each row execute function public.sello_cambio();
alter table public.checklist enable row level security;
drop policy if exists check_ver on public.checklist;
create policy check_ver on public.checklist for select to authenticated
  using (public.mi_rol() in ('dueno','gerente','corredor','asistente','lectura'));
drop policy if exists check_crear on public.checklist;
create policy check_crear on public.checklist for insert to authenticated
  with check (public.mi_rol() in ('dueno','gerente','corredor','asistente'));
drop policy if exists check_editar on public.checklist;
create policy check_editar on public.checklist for update to authenticated
  using (public.mi_rol() in ('dueno','gerente','corredor','asistente'))
  with check (public.mi_rol() in ('dueno','gerente','corredor','asistente'));
drop policy if exists check_borrar on public.checklist;
create policy check_borrar on public.checklist for delete to authenticated
  using (public.mi_rol() in ('dueno','gerente','corredor','asistente'));

-- ---------- 8. Datos privados de cada propiedad (propietario, honorarios, mandato) ----------
create table if not exists public.privados (
  propiedad_id    uuid primary key references public.propiedades(id) on delete cascade,
  datos           jsonb not null default '{}'::jsonb,
  actualizada     timestamptz not null default now(),
  actualizada_por uuid references public.perfiles(id) on delete set null
);
drop trigger if exists sello_cambio on public.privados;
create trigger sello_cambio before insert or update on public.privados
  for each row execute function public.sello_cambio();
/* los ve: dueño, gerente y el corredor que creó la propiedad */
create or replace function public.puede_privado(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.mi_rol() in ('dueno','gerente')
      or (public.mi_rol() = 'corredor' and exists (select 1 from public.propiedades where id = pid and creada_por = auth.uid()))
$$;
alter table public.privados enable row level security;
drop policy if exists priv_ver on public.privados;
create policy priv_ver on public.privados for select to authenticated using (public.puede_privado(propiedad_id));
drop policy if exists priv_crear on public.privados;
create policy priv_crear on public.privados for insert to authenticated with check (public.puede_privado(propiedad_id));
drop policy if exists priv_editar on public.privados;
create policy priv_editar on public.privados for update to authenticated
  using (public.puede_privado(propiedad_id)) with check (public.puede_privado(propiedad_id));

-- ---------- 9. Administración de arriendos ----------
create table if not exists public.contratos (
  id              uuid primary key default gen_random_uuid(),
  propiedad_id    uuid references public.propiedades(id) on delete set null,
  encargado       uuid references public.perfiles(id) on delete set null,
  activo          boolean not null default true,
  datos           jsonb not null default '{}'::jsonb,
  creada          timestamptz not null default now(),
  creada_por      uuid references public.perfiles(id) on delete set null,
  actualizada     timestamptz not null default now(),
  actualizada_por uuid references public.perfiles(id) on delete set null
);
create or replace function public.preparar_contrato() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.creada := now(); new.creada_por := auth.uid();
  elsif auth.uid() is not null then
    new.id := old.id; new.creada := old.creada; new.creada_por := old.creada_por;
  end if;
  new.actualizada := clock_timestamp(); new.actualizada_por := auth.uid();
  return new;
end $$;
drop trigger if exists preparar_contrato on public.contratos;
create trigger preparar_contrato before insert or update on public.contratos
  for each row execute function public.preparar_contrato();

create table if not exists public.pagos (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid not null references public.contratos(id) on delete cascade,
  periodo         date not null,                     -- primer día del mes que se paga
  monto_pagado    numeric not null default 0 check (monto_pagado >= 0),
  monto_cobrado   numeric check (monto_cobrado is null or monto_cobrado >= 0),   -- lo que correspondía cobrar ese mes (fija la UF del momento)
  fecha_pago      date,
  estado          text not null default 'pagado' check (estado in ('pagado','parcial')),
  nota            text check (nota is null or length(nota) <= 500),
  actualizada     timestamptz not null default now(),
  actualizada_por uuid references public.perfiles(id) on delete set null,
  unique (contrato_id, periodo)
);
alter table public.pagos add column if not exists monto_cobrado numeric check (monto_cobrado is null or monto_cobrado >= 0);
drop trigger if exists sello_cambio on public.pagos;
create trigger sello_cambio before insert or update on public.pagos
  for each row execute function public.sello_cambio();

create table if not exists public.gastos (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid not null references public.contratos(id) on delete cascade,
  periodo         date not null,
  concepto        text not null check (length(concepto) between 1 and 200),
  monto           numeric not null check (monto >= 0),
  cargo           text not null default 'propietario' check (cargo in ('propietario','arrendatario','sira')),
  actualizada     timestamptz not null default now(),
  actualizada_por uuid references public.perfiles(id) on delete set null
);
drop trigger if exists sello_cambio on public.gastos;
create trigger sello_cambio before insert or update on public.gastos
  for each row execute function public.sello_cambio();

/* ve y edita un contrato: dueño, gerente y el corredor encargado */
create or replace function public.puede_contrato(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.mi_rol() in ('dueno','gerente')
      or (public.mi_rol() = 'corredor' and exists (select 1 from public.contratos where id = cid and encargado = auth.uid()))
$$;
alter table public.contratos enable row level security;
drop policy if exists ctr_ver on public.contratos;
create policy ctr_ver on public.contratos for select to authenticated
  using (public.mi_rol() in ('dueno','gerente') or (public.mi_rol() = 'corredor' and encargado = auth.uid()));
drop policy if exists ctr_crear on public.contratos;
create policy ctr_crear on public.contratos for insert to authenticated
  with check (public.mi_rol() in ('dueno','gerente') or (public.mi_rol() = 'corredor' and encargado = auth.uid()));
drop policy if exists ctr_editar on public.contratos;
create policy ctr_editar on public.contratos for update to authenticated
  using (public.mi_rol() in ('dueno','gerente') or (public.mi_rol() = 'corredor' and encargado = auth.uid()))
  with check (public.mi_rol() in ('dueno','gerente') or (public.mi_rol() = 'corredor' and encargado = auth.uid()));
drop policy if exists ctr_borrar on public.contratos;
create policy ctr_borrar on public.contratos for delete to authenticated
  using (public.mi_rol() in ('dueno','gerente'));
alter table public.pagos enable row level security;
alter table public.gastos enable row level security;
drop policy if exists pago_todo on public.pagos;
create policy pago_todo on public.pagos for all to authenticated
  using (public.puede_contrato(contrato_id)) with check (public.puede_contrato(contrato_id));
drop policy if exists gasto_todo on public.gastos;
create policy gasto_todo on public.gastos for all to authenticated
  using (public.puede_contrato(contrato_id)) with check (public.puede_contrato(contrato_id));
drop trigger if exists anotar on public.contratos;
create trigger anotar after insert or update or delete on public.contratos for each row execute function public.anotar();
drop trigger if exists anotar on public.pagos;
create trigger anotar after insert or update or delete on public.pagos for each row execute function public.anotar();

-- ---------- 10. Permisos de acceso a las tablas nuevas ----------
revoke all on public.checklist, public.privados, public.contratos, public.pagos, public.gastos from anon, authenticated;
grant select, insert, update, delete on public.checklist, public.contratos, public.pagos, public.gastos to authenticated;
grant select, insert, update on public.privados to authenticated;
grant execute on function public.puede_privado(uuid), public.puede_contrato(uuid) to authenticated;
