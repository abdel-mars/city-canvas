-- Social automation schema

alter table public.shares add column if not exists city_country text;
alter table public.shares add column if not exists shape text;
alter table public.shares add column if not exists image_path text;
alter table public.shares add column if not exists thumb_url text;
alter table public.shares add column if not exists image_purged_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shares_shape_check'
  ) then
    alter table public.shares
      add constraint shares_shape_check
      check (shape is null or shape in ('square', 'horizontal', 'vertical'));
  end if;
end $$;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.shares(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'pinterest')),
  status text not null default 'pending'
    check (status in ('pending', 'posting', 'posted', 'failed', 'needs_review', 'cancelled')),
  scheduled_at timestamptz not null,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  posted_at timestamptz,
  title text,
  description text,
  caption text,
  alt_text text,
  link_url text,
  image_url text,
  media_url text,
  media_path text,
  external_id text,
  external_url text,
  provider_state jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  click_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (share_id, platform)
);

create index if not exists social_posts_due_idx
  on public.social_posts (status, next_attempt_at, scheduled_at);

create unique index if not exists social_posts_slot_unique
  on public.social_posts (platform, scheduled_at)
  where status <> 'cancelled';

create table if not exists public.social_clicks (
  id bigint generated always as identity primary key,
  social_post_id uuid references public.social_posts(id) on delete set null,
  campaign text,
  platform text check (platform is null or platform in ('instagram', 'pinterest')),
  clicked_at timestamptz not null default now()
);

create index if not exists social_clicks_post_idx
  on public.social_clicks (social_post_id, clicked_at desc);

create table if not exists public.social_credentials (
  platform text primary key check (platform in ('instagram', 'pinterest')),
  access_token text not null,
  refresh_token text,
  account_id text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'elmahmoudiabderrahmane@gmail.com', false)
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

alter table public.social_posts enable row level security;
alter table public.social_clicks enable row level security;
alter table public.social_credentials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'Admins read social posts'
  ) then
    create policy "Admins read social posts"
      on public.social_posts for select
      using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'social_clicks' and policyname = 'Admins read social clicks'
  ) then
    create policy "Admins read social clicks"
      on public.social_clicks for select
      using (public.is_admin());
  end if;
end $$;

drop policy if exists "Users can insert shared artwork linked to their account or anon" on public.shares;
drop policy if exists "Anon insert" on public.shares;
drop policy if exists "Owner update shares" on public.shares;
drop policy if exists "Owner delete shares" on public.shares;
drop policy if exists "Users can delete their own shared artwork" on public.shares;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'Admins insert shares'
  ) then
    create policy "Admins insert shares"
      on public.shares for insert
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'Admins update shares'
  ) then
    create policy "Admins update shares"
      on public.shares for update
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'Admins delete shares'
  ) then
    create policy "Admins delete shares"
      on public.shares for delete
      using (public.is_admin());
  end if;
end $$;

create or replace function public.touch_social_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_posts_touch_updated_at on public.social_posts;
create trigger social_posts_touch_updated_at
  before update on public.social_posts
  for each row execute function public.touch_social_posts_updated_at();

create or replace function public.increment_social_post_clicks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.social_post_id is not null then
    update public.social_posts
      set click_count = click_count + 1
      where id = new.social_post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists social_clicks_increment on public.social_clicks;
create trigger social_clicks_increment
  after insert on public.social_clicks
  for each row execute function public.increment_social_post_clicks();

create or replace function public.claim_social_posts(p_limit integer default 2)
returns setof public.social_posts
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.social_posts
  set status = 'posting',
      locked_at = now(),
      attempts = attempts + 1,
      updated_at = now()
  where id in (
    select id
    from public.social_posts
    where (
      status = 'pending'
      and coalesce(next_attempt_at, scheduled_at) <= now()
    )
    or (
      status = 'posting'
      and locked_at < now() - interval '10 minutes'
    )
    order by coalesce(next_attempt_at, scheduled_at), scheduled_at
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  returning *;
end;
$$;

revoke all on function public.claim_social_posts(integer) from public;
revoke all on function public.claim_social_posts(integer) from anon;
revoke all on function public.claim_social_posts(integer) from authenticated;
grant execute on function public.claim_social_posts(integer) to service_role;

insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'social_posts'
  ) then
    alter publication supabase_realtime add table public.social_posts;
  end if;
end $$;
