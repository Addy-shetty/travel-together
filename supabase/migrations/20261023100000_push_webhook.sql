-- Webhook trigger to send push notifications via Edge Function.
-- The webhook must be configured in Supabase Dashboard → Database → Webhooks:
--   Name: send-push
--   Table: notifications
--   Events: INSERT
--   Type: Supabase Edge Function
--   Function: send-push
--   HTTP Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

-- This migration just documents the setup. The actual webhook is configured in the dashboard
-- because Edge Function URLs vary by project.

comment on table public.notifications is
  'In-app and push notifications. INSERT triggers the send-push Edge Function via webhook.';
