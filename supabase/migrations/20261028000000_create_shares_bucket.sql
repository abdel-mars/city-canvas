-- Public bucket for share artwork. The queue uploads through the service role and
-- the app reads the generated public URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('shares', 'shares', true, 10485760)
on conflict (id) do update
set public = true;
