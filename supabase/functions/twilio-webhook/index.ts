import { adminClient, corsHeaders } from '../_shared/http.ts'
import { digitFromText, TEXT, validTwilioSignature } from '../_shared/messaging.ts'
import { ingestReport } from '../_shared/intake.ts'
import { applyReply } from '../_shared/core.ts'

// Twilio webhook for two-way SMS and voice (optional: only needed if you use real SMS / voice).
// Point your Twilio number at this function:
//   Messaging  -> "A message comes in":  POST <FUNCTION_URL>
//   Voice calls started by the app use <Gather action="<TWILIO_WEBHOOK_URL>?kind=voice"> automatically.
// Set TWILIO_AUTH_TOKEN and TWILIO_WEBHOOK_URL (= this function's public URL, exactly as Twilio calls it).
// A resident replies 1 / 2 / 3 (or safe / help / leave); anything else is parsed as a report for human review.

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { ...corsHeaders, 'Content-Type': 'text/xml; charset=utf-8' } })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const publicUrl = Deno.env.get('TWILIO_WEBHOOK_URL')
  if (!publicUrl || !Deno.env.get('TWILIO_AUTH_TOKEN')) return new Response('TWILIO_WEBHOOK_URL / TWILIO_AUTH_TOKEN not configured', { status: 500 })

  const form = new URLSearchParams(await req.text())
  const reqUrl = new URL(req.url)
  // Twilio signs the exact URL it called (including ?kind=voice), so rebuild it from the configured public URL.
  const signedUrl = publicUrl + reqUrl.search
  if (!(await validTwilioSignature(signedUrl, form, req.headers.get('X-Twilio-Signature')))) return new Response('Forbidden', { status: 403 })

  const isVoice = reqUrl.searchParams.get('kind') === 'voice'
  const from = (form.get('From') || '').replace(/\D/g, '')
  const tail = from.slice(-9)
  const text = (isVoice ? form.get('Digits') : form.get('Body'))?.trim().slice(0, 1000) || ''
  const sb = adminClient()

  // Match the sender to a household by phone number.
  let caseId: string | null = null
  if (tail.length === 9) {
    const { data } = await sb.from('cases').select('id, phone, preferred_language').not('phone', 'is', null).ilike('phone', `%${tail.slice(0, 3)}%`)
    const hit = (data || []).find((r: any) => String(r.phone).replace(/\D/g, '').endsWith(tail))
    caseId = hit?.id ?? null
  }
  const lang: 'en' | 'ur' = 'en'

  const code = digitFromText(text)
  if (code && caseId) {
    await applyReply(sb, caseId, code as 1 | 2 | 3, isVoice ? 'voice' : 'sms', text)
    const ack = TEXT.ack[code]
    return xml(isVoice ? `<Say language="en-IN">${esc(ack.en)}</Say>` : `<Message>${esc(lang === 'en' ? ack.en : ack.ur)}</Message>`)
  }

  if (!isVoice && text) {
    try {
      const r = await ingestReport(sb, { raw: text, channel: 'sms', phone: from ? `+${from}` : null, messageId: form.get('MessageSid') || '' })
      return xml(`<Message>${r.needsHuman ? 'Report received. A coordinator will review it shortly.' : 'Report received and prioritised.'}</Message>`)
    } catch { /* fall through */ }
  }
  return xml(isVoice ? '<Say language="en-IN">Sorry, we did not understand. Goodbye.</Say>' : '<Message>Reply 1 = safe, 2 = need help, 3 = leave now.</Message>')
})
