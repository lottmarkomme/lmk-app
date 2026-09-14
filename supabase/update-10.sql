begin;

alter table public.protokolle
  add column if not exists topics jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'protokolle_topics_array'
      and conrelid = 'public.protokolle'::regclass
  ) then
    alter table public.protokolle
      add constraint protokolle_topics_array check (jsonb_typeof(topics) = 'array');
  end if;
end $$;

create or replace function public.protocol_mail_v1(p_job_token text) returns jsonb
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
      'topics',p.topics,
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

revoke all on function public.protocol_mail_v1(text) from public,authenticated;
grant execute on function public.protocol_mail_v1(text) to anon;

notify pgrst,'reload schema';
commit;
