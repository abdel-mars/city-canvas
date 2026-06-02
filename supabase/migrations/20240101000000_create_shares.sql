-- Create the shares table
create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  city_name text not null,
  image_url text not null,
  settings_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table shares enable ro
w level security;

-- Anyone can read a share (needed to render /share/:id publicly)
create policy "Public read"
  on shares for select
  using (true);

-- Anyone can create a share (anon users)
create policy "Anon insert"
  on shares for insert
  with check (true);
