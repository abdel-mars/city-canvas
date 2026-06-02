-- Create profiles table linked to Supabase Auth users
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  updated_at timestamptz default now()
);

-- Alter the shares table to add authentication and curator context
alter table public.shares add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.shares add column if not exists creator_name text default 'Anonymous';
alter table public.shares add column if not exists creator_email text;

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.shares enable row level security;

-- Profiles Policies
create policy "Public profiles are viewable by everyone" 
  on public.profiles for select 
  using (true);

create policy "Users can insert their own profile" 
  on public.profiles for insert 
  with check (auth.uid() = id);

create policy "Users can update their own profile" 
  on public.profiles for update 
  using (auth.uid() = id);

-- Shares Policies updates
drop policy if exists "Public read" on public.shares;
drop policy if exists "Anon insert" on public.shares;

create policy "Anyone can read shared artwork" 
  on public.shares for select 
  using (true);

create policy "Users can insert shared artwork linked to their account or anon" 
  on public.shares for insert 
  with check (auth.uid() = user_id or user_id is null);

create policy "Users can delete their own shared artwork" 
  on public.shares for delete 
  using (auth.uid() = user_id);
