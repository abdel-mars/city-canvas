do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'social_posts'
      and policyname = 'Admins update social posts'
  ) then
    create policy "Admins update social posts"
      on public.social_posts for update
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
