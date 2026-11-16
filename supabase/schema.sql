-- ClayPanda portfolio: ejecutar una vez en el SQL Editor de Supabase.
-- Después: Authentication > Sign In / Providers > desactivar "Allow new users to sign up",
-- invitar a cada miembro desde Authentication > Users y añadirlo a team_members (ver el final).

create table if not exists public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

create table if not exists public.pieces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null check (category in ('model', 'animation', 'texture')),
  tags text[] not null default '{}',
  model_path text,
  model_format text check (model_format in ('glb', 'bbmodel')),
  poster_path text,
  published boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.piece_media (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  path text not null,
  sort_order integer not null default 0
);

create table if not exists public.texture_variants (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  name text not null,
  path text not null
);

create index if not exists piece_media_piece_idx on public.piece_media (piece_id);
create index if not exists texture_variants_piece_idx on public.texture_variants (piece_id);

-- ¿El usuario actual es del equipo?
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.team_members where user_id = auth.uid());
$$;

alter table public.team_members enable row level security;
alter table public.pieces enable row level security;
alter table public.piece_media enable row level security;
alter table public.texture_variants enable row level security;

-- team_members: cada quien solo ve su propia fila; nadie la edita desde el sitio.
create policy "member reads own row" on public.team_members
  for select using (user_id = auth.uid());

-- pieces: el público lee lo publicado; el equipo lee y escribe todo.
create policy "public reads published" on public.pieces
  for select using (published or public.is_team_member());
create policy "team inserts" on public.pieces
  for insert with check (public.is_team_member());
create policy "team updates" on public.pieces
  for update using (public.is_team_member()) with check (public.is_team_member());
create policy "team deletes" on public.pieces
  for delete using (public.is_team_member());

create policy "public reads media of published" on public.piece_media
  for select using (
    public.is_team_member()
    or exists (select 1 from public.pieces p where p.id = piece_id and p.published)
  );
create policy "team writes media" on public.piece_media
  for all using (public.is_team_member()) with check (public.is_team_member());

create policy "public reads textures of published" on public.texture_variants
  for select using (
    public.is_team_member()
    or exists (select 1 from public.pieces p where p.id = piece_id and p.published)
  );
create policy "team writes textures" on public.texture_variants
  for all using (public.is_team_member()) with check (public.is_team_member());

-- Almacenamiento: buckets públicos de solo lectura, con límite de tamaño y tipo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('models', 'models', true, 52428800,
    array['model/gltf-binary', 'model/gltf+json', 'application/json']),
  ('media', 'media', true, 104857600,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy "team uploads" on storage.objects
  for insert with check (bucket_id in ('models', 'media') and public.is_team_member());
create policy "team replaces" on storage.objects
  for update using (bucket_id in ('models', 'media') and public.is_team_member());
create policy "team removes" on storage.objects
  for delete using (bucket_id in ('models', 'media') and public.is_team_member());
create policy "team lists" on storage.objects
  for select using (bucket_id in ('models', 'media') and public.is_team_member());

-- Para dar acceso a un miembro ya invitado (cambia el correo):
-- insert into public.team_members (user_id)
--   select id from auth.users where email = 'persona@ejemplo.com';
