-- 10 MAP DATA + BACKGROUND HEARTBEAT
-- Run after 09. Safe to re-run.
--   * staging points for rescue assets so the live map has real positions
--   * pg_cron job that calls the `tick` edge function every minute (silence escalation, hazard clock, live weather)
--     so the platform keeps working even when no coordinator has a browser open

-- ---------------------------------------------------------------- asset positions
-- Spread assets across real staging points (Keamari port, Lyari, Korangi, Malir) until GPS reports arrive.
WITH depots(i, lng, lat) AS (
  VALUES (0, 66.9792, 24.8105), (1, 67.0011, 24.8607), (2, 67.1204, 24.8376), (3, 67.1950, 24.8930)
),
numbered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY id) - 1) % 4 AS i FROM public.assets WHERE current_location IS NULL
)
UPDATE public.assets a
SET current_location = ST_SetSRID(ST_MakePoint(d.lng, d.lat), 4326)
FROM numbered n JOIN depots d ON d.i = n.i
WHERE a.id = n.id;

-- ---------------------------------------------------------------- heartbeat (pg_cron + pg_net)
-- One-time setup, run ONCE in the SQL editor with your own values (they are stored encrypted in Supabase Vault):
--
--   select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
--   select vault.create_secret('THE-SAME-VALUE-AS-THE-CRON_SECRET-FUNCTION-SECRET', 'cron_secret');
--
-- Then re-run this file (or just the block below).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_secret') THEN
    RAISE NOTICE 'Heartbeat NOT scheduled: create the vault secrets project_url and cron_secret first (see comments above), then re-run.';
    RETURN;
  END IF;

  -- Replace any previous schedule so re-running never creates duplicates.
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nlb-tick';

  PERFORM cron.schedule(
    'nlb-tick',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $job$
  );
  RAISE NOTICE 'Heartbeat scheduled: nlb-tick runs every minute.';
END $$;
