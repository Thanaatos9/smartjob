-- Stockage du CV original en PDF (le texte extrait reste dans profiles.cv_text)
alter table public.profiles add column if not exists cv_pdf_path text;

insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

create policy "cvs_select_own" on storage.objects
  for select using (
    bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "cvs_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "cvs_update_own" on storage.objects
  for update using (
    bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text
  );
