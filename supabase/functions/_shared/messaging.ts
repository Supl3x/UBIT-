import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type Channel = 'telegram' | 'sms' | 'voice' | 'whatsapp' | 'mesh' | 'pdma_1129'
export type Route = { channel: Channel | 'buddy'; reason: string }

export const TEXT = {
  checkin: {
    en: 'Flood warning for your area. Reply 1 = I am safe, 2 = I need help, 3 = I must leave now.',
    ur: 'آپ کے علاقے میں سیلاب کا خطرہ ہے۔ جواب دیں: 1 = میں محفوظ ہوں، 2 = مجھے مدد چاہیے، 3 = مجھے ابھی نکلنا ہے۔',
  },
  reminder: {
    en: 'Reminder: we have not heard from you. Reply 1 = safe, 2 = need help, 3 = leave now.',
    ur: 'یاد دہانی: آپ کی طرف سے جواب نہیں ملا۔ 1 = محفوظ، 2 = مدد چاہیے، 3 = ابھی نکلنا ہے۔',
  },
  call: {
    en: 'Automated voice call: flood warning. Press 1 if safe, 2 for help, 3 to evacuate.',
    ur: 'خودکار فون کال: سیلاب کی وارننگ۔ محفوظ ہوں تو 1، مدد کے لیے 2، نکلنے کے لیے 3 دبائیں۔',
  },
  ack: {
    1: { en: 'Thank you. Stay safe. We will check again later.', ur: 'شکریہ۔ محفوظ رہیں۔ ہم دوبارہ رابطہ کریں گے۔' },
    2: { en: 'Help request received. A responder is being assigned.', ur: 'مدد کی درخواست موصول ہوئی۔ ریسپانڈر روانہ کیا جا رہا ہے۔' },
    3: { en: 'Evacuation request received. Stay where you are visible; a team is on the way.', ur: 'انخلا کی درخواست موصول ہوئی۔ ٹیم روانہ ہو رہی ہے، اپنی جگہ پر رہیں۔' },
  } as Record<number, { en: string; ur: string }>,
  alert: {
    advisory: { en: 'Advisory: heavy rain expected. Prepare documents, medicines and a bag.', ur: 'ایڈوائزری: شدید بارش متوقع ہے۔ دستاویزات، ادویات اور سامان تیار رکھیں۔' },
    warning: { en: 'Warning: flooding likely. Move vulnerable family members to higher ground.', ur: 'وارننگ: سیلاب کا امکان ہے۔ کمزور افراد کو اونچی جگہ منتقل کریں۔' },
    evacuation: { en: 'EVACUATE NOW to the nearest shelter. Do not wait.', ur: 'فوراً قریبی پناہ گاہ کی طرف نکلیں۔ انتظار نہ کریں۔' },
  } as Record<string, { en: string; ur: string }>,
}

export function digitFromText(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/[۱١]/g, '1').replace(/[۲٢]/g, '2').replace(/[۳٣]/g, '3')
  if (/^[123]$/.test(t)) return Number(t)
  if (/^(safe|theek|theek hoon|ٹھیک|محفوظ)/.test(t)) return 1
  if (/^(help|madad|مدد)/.test(t)) return 2
  if (/^(leave|evacuate|nikalna|نکل)/.test(t)) return 3
  return null
}

/** Pick the channel that will actually reach this person. */
export function routeChannel(c: { phone_type?: string | null; phone?: string | null }, telegramLinked: boolean): Route {
  if (c.phone_type === 'smartphone' && telegramLinked) return { channel: 'telegram', reason: 'Smartphone with linked Telegram: instant, free, two-way.' }
  if (c.phone_type === 'smartphone') return { channel: 'sms', reason: 'Smartphone but Telegram not linked yet: SMS fallback.' }
  if (c.phone_type === 'basic') return { channel: 'sms', reason: 'Basic phone: SMS reaches it; voice is the next escalation.' }
  return { channel: 'buddy', reason: 'No phone: only a buddy volunteer can warn this person.' }
}

export async function telegramSend(chatId: number, text: string): Promise<boolean> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) return false
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    return r.ok
  } catch { return false }
}

// ---------------------------------------------------------------- Twilio (optional: real SMS + voice)
// Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to send real SMS and voice calls.
// Without them SMS / voice stay simulated (logged, marked delivered) so the demo still works.
// TWILIO_WEBHOOK_URL (the public URL of the twilio-webhook function) lets residents reply 1/2/3 by SMS or keypad.

export const twilioConfigured = () =>
  !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_FROM_NUMBER'))

/** Pakistani numbers: 0300 1234567, 92300..., +92 300 ... all become +92300XXXXXXX. */
export function toE164(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('92')) return `+${d}`
  if (d.startsWith('0')) return `+92${d.slice(1)}`
  if (d.length === 10) return `+92${d}`
  return `+${d}`
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function twilioSend(
  kind: 'sms' | 'voice',
  phone: string,
  text: { en: string; ur: string },
  lang: 'en' | 'ur',
): Promise<'sent' | 'failed' | 'unconfigured'> {
  if (!twilioConfigured()) return 'unconfigured'
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const auth = 'Basic ' + btoa(`${sid}:${Deno.env.get('TWILIO_AUTH_TOKEN')!}`)
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`
  const form = new URLSearchParams({ To: toE164(phone), From: Deno.env.get('TWILIO_FROM_NUMBER')! })
  let url = `${base}/Messages.json`
  if (kind === 'sms') {
    form.set('Body', lang === 'ur' ? text.ur : text.en)
  } else {
    url = `${base}/Calls.json`
    const urduVoice = Deno.env.get('TWILIO_URDU_VOICE') // e.g. a Google TTS voice that supports Urdu
    const say = lang === 'ur' && urduVoice
      ? `<Say voice="${xmlEscape(urduVoice)}" language="ur-IN">${xmlEscape(text.ur)}</Say>`
      : `<Say language="en-IN">${xmlEscape(text.en)}</Say>`
    const hook = Deno.env.get('TWILIO_WEBHOOK_URL')
    form.set('Twiml', hook
      ? `<Response><Gather numDigits="1" timeout="8" action="${xmlEscape(hook)}?kind=voice" method="POST">${say}</Gather>${say}</Response>`
      : `<Response>${say}</Response>`)
  }
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
    return r.ok ? 'sent' : 'failed'
  } catch { return 'failed' }
}

/** Twilio signs webhooks: HMAC-SHA1 of the full URL + sorted POST params, base64. */
export async function validTwilioSignature(url: string, params: URLSearchParams, signature: string | null): Promise<boolean> {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!token || !signature) return false
  const data = url + [...params.keys()].sort().map((k) => k + (params.get(k) ?? '')).join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return expected === signature
}

export type DeliverResult = { channel: string; delivered: boolean; simulated: boolean; reason: string }

/**
 * Sends (Telegram is real, SMS/voice are simulated behind the same function) and logs to communication_log.
 */
export async function deliver(
  sb: SupabaseClient,
  c: { id: string; phone_type?: string | null; phone?: string | null; preferred_language?: string | null },
  msg: { en: string; ur: string },
  forceChannel?: Channel | 'buddy',
): Promise<DeliverResult> {
  const { data: link } = await sb.from('telegram_links').select('chat_id, language').eq('case_id', c.id).maybeSingle()
  const route = forceChannel ? { channel: forceChannel, reason: 'Channel forced by caller.' } : routeChannel(c, !!link)
  const lang = (link?.language || c.preferred_language || 'ur') as 'en' | 'ur'
  const text = lang === 'en' ? msg.en : msg.ur

  let delivered = false, simulated = true
  if (route.channel === 'telegram' && link) {
    delivered = await telegramSend(Number(link.chat_id), text)
    simulated = !Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (simulated) delivered = true
  } else if (route.channel === 'buddy') {
    await sb.from('notifications').insert({
      audience_role: 'volunteer', text: `Buddy visit needed: ${msg.en}`, text_urdu: `بڈی وزٹ درکار: ${msg.ur}`,
      type: 'buddy', related_case_id: c.id,
    })
    delivered = true
  } else if ((route.channel === 'sms' || route.channel === 'voice') && c.phone) {
    const r = await twilioSend(route.channel, c.phone, msg, lang)
    if (r === 'unconfigured') { delivered = true; simulated = true } // simulated transcript behind the same call
    else { delivered = r === 'sent'; simulated = false }
  } else {
    delivered = true // WhatsApp / mesh / no number on file: simulated transcript
  }

  await sb.from('communication_log').insert({
    case_id: c.id,
    channel: route.channel === 'buddy' ? 'mesh' : route.channel,
    direction: 'outbound',
    message_text: msg.en, message_text_urdu: msg.ur,
    delivered, delivered_at: delivered ? new Date().toISOString() : null,
  })
  return { channel: route.channel, delivered, simulated, reason: route.reason }
}
