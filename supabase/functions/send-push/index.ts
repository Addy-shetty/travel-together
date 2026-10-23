// Edge Function: send-push
// Triggered by database webhook on notification insert, sends push via Expo Push API.
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Set secret: supabase secrets set EXPO_ACCESS_TOKEN=<your-token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface NotificationPayload {
  record: {
    id: string
    user_id: string
    trip_id: string | null
    type: string
    title: string
    body: string | null
    data: Record<string, unknown>
    action_required: boolean
  }
}

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
  priority?: 'default' | 'normal' | 'high'
  channelId?: string
}

Deno.serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json()
    const { record } = payload

    if (!record?.user_id || !record?.title) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 })
    }

    // Initialize Supabase client with service role for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if user has push notifications enabled
    const { data: profile } = await supabase
      .from('profiles')
      .select('notifications_enabled')
      .eq('id', record.user_id)
      .single()

    if (!profile?.notifications_enabled) {
      return new Response(JSON.stringify({ skipped: 'notifications_disabled' }), { status: 200 })
    }

    // Get user's push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', record.user_id)

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no_tokens' }), { status: 200 })
    }

    // Build Expo push messages
    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: record.title,
      body: record.body ?? '',
      data: {
        notification_id: record.id,
        trip_id: record.trip_id,
        type: record.type,
        action_required: record.action_required,
        ...record.data,
      },
      sound: 'default',
      priority: record.action_required ? 'high' : 'default',
      channelId: record.action_required ? 'action-required' : 'default',
    }))

    // Send to Expo Push API
    const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (expoToken) {
      headers['Authorization'] = `Bearer ${expoToken}`
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    })

    const result = await response.json()

    // Clean up invalid tokens
    if (result.data) {
      const invalidTokens: string[] = []
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i]
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(tokens[i].token)
        }
      }
      if (invalidTokens.length > 0) {
        await supabase.from('push_tokens').delete().in('token', invalidTokens)
      }
    }

    return new Response(JSON.stringify({ sent: messages.length, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Push notification error:', error)
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
