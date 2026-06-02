-- Phase 1: Creator Gallery
-- Add print_link and bio to profiles
alter table profiles add column if not exists print_link text;
alter table profiles add column if not exists bio text;

-- Add is_published, user_id, creator_name to shares
alter table shares add column if not exists is_published boolean not null default false;
alter table shares add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table shares add column if not exists creator_name text;

-- Allow authenticated users to update their own shares (publish/unpublish)
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'shares' and policyname = 'Owner update shares'
  ) then
    create policy "Owner update shares"
      on shares for update
      using (auth.uid() = user_id);
  end if;
end $$;

-- Allow authenticated users to delete their own shares
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'shares' and policyname = 'Owner delete shares'
  ) then
    create policy "Owner delete shares"
      on shares for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- Allow owners to update profiles
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'profiles' and policyname = 'Owner update profile'
  ) then
    create policy "Owner update profile"
      on profiles for update
      using (auth.uid() = id);
  end if;
end $$;
