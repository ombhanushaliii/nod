-- Arkiv jobs on Supabase Cron: every hour, pg_cron asks pg_net to call the
-- api function's /api/jobs/mirror and /api/jobs/renew endpoints.
--
-- The project URL and the jobs secret are read from Vault when each job runs,
-- so neither is in git. Add them once (SQL editor), with JOBS_SECRET being the
-- same value as the function secret:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<JOBS_SECRET>', 'jobs_secret');

-- A report that failed to extend sits out for a day, so it can't block the rest.
alter table public.scam_reports_archive add column renew_failed_at timestamptz;

create index scam_reports_archive_renew_idx on public.scam_reports_archive (arkiv_expires_at)
  where verified;

-- Calls one job endpoint. Does nothing until both Vault secrets exist.
create function public.call_arkiv_job(p_job text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'jobs_secret';
  if v_url is null or v_secret is null then
    raise warning 'arkiv job %: add project_url and jobs_secret to Vault', p_job;
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/api/jobs/' || p_job,
    headers := jsonb_build_object('content-type', 'application/json', 'x-jobs-secret', v_secret),
    body := '{}'::jsonb,
    -- Longer than the renewer's 60 s budget plus its last extend.
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.call_arkiv_job(text) from public, anon, authenticated;

-- pg_cron, pg_net and Vault exist on Supabase. Skipped where they don't
-- (local test databases).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('arkiv-mirror', '0 * * * *', 'select public.call_arkiv_job(''mirror'')');
    perform cron.schedule('arkiv-renew', '30 * * * *', 'select public.call_arkiv_job(''renew'')');
  else
    raise notice 'pg_cron or pg_net not available: Arkiv jobs not scheduled';
  end if;
end;
$$;
