begin;

create table public.zug_event_attendance (
  event_id uuid not null references public.zug_events(id) on delete cascade,
  profile_id uuid not null default private.current_profile_id() references public.profiles(id) on delete cascade,
  status text not null check (status in ('kann','kann_nicht','unsicher')),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

alter table public.zug_event_attendance enable row level security;
grant select, insert, update, delete on public.zug_event_attendance to authenticated;
revoke all on public.zug_event_attendance from anon;

create policy event_attendance_read on public.zug_event_attendance
  for select to authenticated
  using (private.current_profile_id() is not null);
create policy event_attendance_add on public.zug_event_attendance
  for insert to authenticated
  with check (profile_id = private.current_profile_id());
create policy event_attendance_edit on public.zug_event_attendance
  for update to authenticated
  using (profile_id = private.current_profile_id())
  with check (profile_id = private.current_profile_id());
create policy event_attendance_remove on public.zug_event_attendance
  for delete to authenticated
  using (profile_id = private.current_profile_id());
create index zug_event_attendance_profile_idx on public.zug_event_attendance(profile_id);

create table public.protokolle (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.termine(id) on delete cascade,
  event_id uuid references public.zug_events(id) on delete cascade,
  created_by uuid not null default private.current_profile_id() references public.profiles(id),
  original_name text not null check (length(original_name) between 1 and 240),
  storage_path text not null unique,
  mime_type text not null,
  status text not null default 'pending' check (status in ('pending','processing','ready','error')),
  summary text,
  decisions jsonb not null default '[]'::jsonb check (jsonb_typeof(decisions) = 'array'),
  action_items jsonb not null default '[]'::jsonb check (jsonb_typeof(action_items) = 'array'),
  error_message text,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  mailed_at timestamptz,
  mailed_recipient_count integer,
  constraint protokolle_one_date check (num_nonnulls(meeting_id,event_id) = 1)
);

create index protokolle_meeting_idx on public.protokolle(meeting_id);
create index protokolle_event_idx on public.protokolle(event_id);
create index protokolle_created_by_idx on public.protokolle(created_by);
create index protokolle_pending_mail_idx on public.protokolle(created_at) where status='ready' and mailed_at is null;

alter table public.protokolle enable row level security;
grant select, insert on public.protokolle to authenticated;
revoke all on public.protokolle from anon;

create policy protocol_read on public.protokolle
  for select to authenticated
  using (private.current_profile_id() is not null);
create policy protocol_add on public.protokolle
  for insert to authenticated
  with check (private.is_officer() and created_by = private.current_profile_id());

create table private.protocol_mail_deliveries (
  protocol_id uuid not null references public.protokolle(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (protocol_id,profile_id)
);
alter table private.protocol_mail_deliveries enable row level security;
create index protocol_mail_deliveries_profile_idx on private.protocol_mail_deliveries(profile_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('protokolle','protokolle',false,8388608,array[
  'application/pdf','text/plain','text/markdown','application/rtf','text/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text'
])
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy protocol_file_add on storage.objects
  for insert to authenticated
  with check (
    bucket_id='protokolle'
    and private.is_officer()
    and (storage.foldername(name))[1] = private.current_profile_id()::text
  );
create policy protocol_file_read on storage.objects
  for select to authenticated
  using (bucket_id='protokolle' and private.is_officer());
create policy protocol_file_remove on storage.objects
  for delete to authenticated
  using (bucket_id='protokolle' and private.is_officer());

create function public.protocol_mail_v1(p_job_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from private.app_settings
    where setting_key='weekly_mail_token'
      and value_hash=encode(extensions.digest(trim(p_job_token),'sha256'),'hex')
  ) then
    raise exception 'Nicht autorisiert' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,
      'title',coalesce(t.title,e.title),
      'starts_at',coalesce(t.starts_at,e.starts_at),
      'summary',p.summary,
      'decisions',p.decisions,
      'action_items',p.action_items,
      'recipients',coalesce((
        select jsonb_agg(jsonb_build_object('id',rec.profile_id,'name',rec.full_name,'email',rec.email) order by rec.full_name)
        from (
          select pr.id profile_id,pr.full_name,u.email
          from public.profiles pr
          join auth.users u on u.id=pr.user_id
          where u.email is not null
            and not exists (
              select 1 from private.protocol_mail_deliveries d
              where d.protocol_id=p.id and d.profile_id=pr.id
            )
        ) rec
      ),'[]'::jsonb)
    ) order by p.created_at)
    from public.protokolle p
    left join public.termine t on t.id=p.meeting_id
    left join public.zug_events e on e.id=p.event_id
    where p.status='ready' and p.mailed_at is null
  ),'[]'::jsonb);
end; $$;

create function public.mark_protocol_mailed_v1(p_job_token text,p_protocol_id uuid,p_profile_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if not exists (
    select 1 from private.app_settings
    where setting_key='weekly_mail_token'
      and value_hash=encode(extensions.digest(trim(p_job_token),'sha256'),'hex')
  ) then
    raise exception 'Nicht autorisiert' using errcode='42501';
  end if;
  if p_profile_id is not null then
    insert into private.protocol_mail_deliveries(protocol_id,profile_id)
    values (p_protocol_id,p_profile_id)
    on conflict do nothing;
  end if;
  update public.protokolle p
  set mailed_at=now(),
      mailed_recipient_count=(select count(*) from private.protocol_mail_deliveries d where d.protocol_id=p.id)
  where p.id=p_protocol_id and p.status='ready' and p.mailed_at is null
    and not exists (
      select 1
      from public.profiles pr
      join auth.users u on u.id=pr.user_id and u.email is not null
      where not exists (
        select 1 from private.protocol_mail_deliveries d
        where d.protocol_id=p.id and d.profile_id=pr.id
      )
    );
  get diagnostics changed = row_count;
  return changed > 0;
end; $$;

revoke all on function public.protocol_mail_v1(text) from public,authenticated;
revoke all on function public.mark_protocol_mailed_v1(text,uuid,uuid) from public,authenticated;
grant execute on function public.protocol_mail_v1(text) to anon;
grant execute on function public.mark_protocol_mailed_v1(text,uuid,uuid) to anon;

notify pgrst,'reload schema';
commit;
