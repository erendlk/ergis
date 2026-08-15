-- ERGIS FAZ 1: Sahiplik temelli proje kalıcılığı.
-- Bu migration Supabase SQL Editor veya Supabase CLI ile uygulanmalıdır.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'shared', 'public')),
  crs text not null default 'EPSG:4326',
  schema_version integer not null default 1 check (schema_version > 0),
  map_state jsonb not null default '{}'::jsonb,
  project_data jsonb not null default '{}'::jsonb,
  print_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `projects` tablosu ERGIS'in önceki sürümünden zaten varsa CREATE TABLE IF NOT EXISTS
-- onun kolonlarını değiştirmez. Aşağıdaki ALTER'ler eski şemayı veri silmeden Faz 1
-- sözleşmesine taşır. owner_id'nin önce var olduğu varsayılmaz.
alter table public.projects add column if not exists owner_id uuid;
alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists visibility text;
alter table public.projects add column if not exists crs text;
alter table public.projects add column if not exists schema_version integer;
alter table public.projects add column if not exists map_state jsonb;
alter table public.projects add column if not exists project_data jsonb;
alter table public.projects add column if not exists print_settings jsonb;
alter table public.projects add column if not exists created_at timestamptz;
alter table public.projects add column if not exists updated_at timestamptz;

-- Eski şemadaki yaygın user_id/created_by alanlarını yalnızca UUID olduklarında
-- güvenle sahiplik bilgisine taşır. Sahibi belirlenemeyen kayıtlar silinmez ancak
-- bir yönetici tarafından açıkça sahiplenilene kadar RLS ile erişilemez kalır.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects'
      and column_name = 'user_id' and data_type = 'uuid'
  ) then
    execute 'update public.projects set owner_id = user_id where owner_id is null and user_id is not null';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects'
      and column_name = 'created_by' and data_type = 'uuid'
  ) then
    execute 'update public.projects set owner_id = created_by where owner_id is null and created_by is not null';
  end if;
end;
$$;

update public.projects
set
  name = coalesce(nullif(trim(name), ''), nullif(to_jsonb(projects)->>'title', ''), 'İsimsiz proje'),
  visibility = coalesce(nullif(visibility, ''), 'private'),
  crs = coalesce(nullif(crs, ''), 'EPSG:4326'),
  schema_version = coalesce(schema_version, 1),
  map_state = coalesce(map_state, '{}'::jsonb),
  project_data = coalesce(
    project_data,
    case
      when jsonb_typeof(to_jsonb(projects)->'data') = 'object'
        then to_jsonb(projects)->'data'
      else '{}'::jsonb
    end
  ),
  print_settings = coalesce(print_settings, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.projects alter column owner_id set default auth.uid();
alter table public.projects alter column name set default 'Yeni proje';
alter table public.projects alter column visibility set default 'private';
alter table public.projects alter column crs set default 'EPSG:4326';
alter table public.projects alter column schema_version set default 1;
alter table public.projects alter column map_state set default '{}'::jsonb;
alter table public.projects alter column project_data set default '{}'::jsonb;
alter table public.projects alter column print_settings set default '{}'::jsonb;
alter table public.projects alter column created_at set default now();
alter table public.projects alter column updated_at set default now();

do $$
begin
  if not exists (select 1 from public.projects where owner_id is null) then
    alter table public.projects alter column owner_id set not null;
  end if;

  alter table public.projects alter column name set not null;
  alter table public.projects alter column visibility set not null;
  alter table public.projects alter column crs set not null;
  alter table public.projects alter column schema_version set not null;
  alter table public.projects alter column map_state set not null;
  alter table public.projects alter column project_data set not null;
  alter table public.projects alter column print_settings set not null;
  alter table public.projects alter column created_at set not null;
  alter table public.projects alter column updated_at set not null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_owner_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade not valid;
  end if;
end;
$$;

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'owner')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Faz 1 istemcisi proje belgesini projects.project_data alanında saklar.
-- Aşağıdaki tablolar, sonraki fazlarda JSON belgeden normalleştirilmiş GIS verisine
-- geçiş için hazırdır. Geometri RFC 7946 GeoJSON saklar; PostGIS'e ST_GeomFromGeoJSON
-- ile dönüştürülebilir ve CRS her kayıtta korunur.
create table if not exists public.project_layers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  geometry_type text check (geometry_type in ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon')),
  crs text not null default 'EPSG:4326',
  metadata jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_features (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  layer_id uuid not null references public.project_layers(id) on delete cascade,
  geometry jsonb not null,
  geometry_type text not null check (geometry_type in ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon')),
  crs text not null default 'EPSG:4326',
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  service_type text not null check (service_type in ('WMS', 'WFS', 'WMTS')),
  url text not null,
  layer_name text,
  crs text not null default 'EPSG:4326',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_analysis_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  analysis_type text not null,
  parameters jsonb not null default '{}'::jsonb,
  result_layer_id uuid references public.project_layers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index if not exists project_members_user_idx on public.project_members (user_id, project_id);
create index if not exists project_layers_project_idx on public.project_layers (project_id, sort_order);
create index if not exists project_features_layer_idx on public.project_features (layer_id);
create index if not exists project_features_project_idx on public.project_features (project_id);
create index if not exists project_services_project_idx on public.project_services (project_id);
create index if not exists project_analysis_results_project_idx on public.project_analysis_results (project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_layers_set_updated_at on public.project_layers;
create trigger project_layers_set_updated_at before update on public.project_layers
for each row execute function public.set_updated_at();

drop trigger if exists project_features_set_updated_at on public.project_features;
create trigger project_features_set_updated_at before update on public.project_features
for each row execute function public.set_updated_at();

drop trigger if exists project_services_set_updated_at on public.project_services;
create trigger project_services_set_updated_at before update on public.project_services
for each row execute function public.set_updated_at();

drop trigger if exists project_analysis_results_set_updated_at on public.project_analysis_results;
create trigger project_analysis_results_set_updated_at before update on public.project_analysis_results
for each row execute function public.set_updated_at();

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id and pm.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('editor', 'owner')
  );
$$;

revoke execute on function public.can_access_project(uuid) from public;
revoke execute on function public.can_edit_project(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_layers enable row level security;
alter table public.project_features enable row level security;
alter table public.project_services enable row level security;
alter table public.project_analysis_results enable row level security;

-- Bu tablolar ERGIS proje verisinin güvenlik sınırıdır. Önceki sürümden kalmış
-- izin verici politikalar kullanıcılar arası erişim yaratmamalıdır; tüm mevcut
-- politikaları güvenli, sahiplik tabanlı politikalarla değiştiriyoruz. Veri silinmez.
do $$
declare
  target_table text;
  existing_policy record;
begin
  foreach target_table in array array[
    'projects',
    'project_members',
    'project_layers',
    'project_features',
    'project_services',
    'project_analysis_results'
  ] loop
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', existing_policy.policyname, target_table);
    end loop;
  end loop;
end;
$$;

drop policy if exists "projects_select_accessible" on public.projects;
create policy "projects_select_accessible" on public.projects for select
using (public.can_access_project(id));
drop policy if exists "projects_insert_owner" on public.projects;
create policy "projects_insert_owner" on public.projects for insert
with check (owner_id = auth.uid());
drop policy if exists "projects_update_editable" on public.projects;
create policy "projects_update_editable" on public.projects for update
using (public.can_edit_project(id)) with check (public.can_edit_project(id));
drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects for delete
using (owner_id = auth.uid());

drop policy if exists "members_select_accessible" on public.project_members;
create policy "members_select_accessible" on public.project_members for select
using (public.can_access_project(project_id));
drop policy if exists "members_manage_owner" on public.project_members;
create policy "members_manage_owner" on public.project_members for all
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "layers_select_accessible" on public.project_layers for select using (public.can_access_project(project_id));
create policy "layers_insert_editable" on public.project_layers for insert with check (public.can_edit_project(project_id));
create policy "layers_update_editable" on public.project_layers for update using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "layers_delete_editable" on public.project_layers for delete using (public.can_edit_project(project_id));

create policy "features_select_accessible" on public.project_features for select using (public.can_access_project(project_id));
create policy "features_insert_editable" on public.project_features for insert with check (public.can_edit_project(project_id));
create policy "features_update_editable" on public.project_features for update using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "features_delete_editable" on public.project_features for delete using (public.can_edit_project(project_id));

create policy "services_select_accessible" on public.project_services for select using (public.can_access_project(project_id));
create policy "services_insert_editable" on public.project_services for insert with check (public.can_edit_project(project_id));
create policy "services_update_editable" on public.project_services for update using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "services_delete_editable" on public.project_services for delete using (public.can_edit_project(project_id));

create policy "analysis_select_accessible" on public.project_analysis_results for select using (public.can_access_project(project_id));
create policy "analysis_insert_editable" on public.project_analysis_results for insert with check (public.can_edit_project(project_id));
create policy "analysis_update_editable" on public.project_analysis_results for update using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "analysis_delete_editable" on public.project_analysis_results for delete using (public.can_edit_project(project_id));
