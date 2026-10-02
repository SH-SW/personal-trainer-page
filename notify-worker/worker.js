/* Relay del formulario de contacto → Telegram + WhatsApp.
   Los tokens viven aquí como secretos (nunca en la web pública).

   Secretos (npx wrangler secret put NOMBRE):
     TELEGRAM_BOT_TOKEN  token de @BotFather
     TELEGRAM_CHAT_ID    id del chat de Alex con el bot
     WHATSAPP_PHONE      número de Alex sin "+", p. ej. 34617111232
     CALLMEBOT_APIKEY    apikey que CallMeBot envía a ese WhatsApp
   Variable (wrangler.toml):
     ALLOWED_ORIGIN      origen de la web, p. ej. https://usuario.github.io  ("*" = cualquiera) */

const FIELDS = [
  ['nombre', '👤 Nombre'],
  ['email', '📧 Email'],
  ['telefono', '📞 Teléfono'],
  ['genero', '⚧ Género'],
  ['fecha_nacimiento', '🎂 Nacimiento'],
  ['frecuencia', '🏋️ Frecuencia'],
  ['objetivo', '🎯 Objetivo'],
  ['comentarios', '💬 Comentarios'],
  ['idioma', '🌐 Idioma'],
];
const TITLE = '🔔 Nuevo cliente interesado';
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, telRe = /^\+?[\d\s().-]{9,}$/;

const clean = v => String(v ?? '').trim().slice(0, 1000);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendTelegram(env, data) {
  const lines = FIELDS.filter(([k]) => data[k]).map(([k, label]) => `<b>${label}:</b> ${esc(data[k])}`);
  const digits = data.telefono.replace(/\D/g, '');
  const msg = `<b>${TITLE}</b>\n\n${lines.join('\n')}\n\n<a href="https://wa.me/${digits}">Responder por WhatsApp</a>`;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error('telegram ' + res.status + ' ' + await res.text());
}

async function sendWhatsApp(env, data) {
  const lines = FIELDS.filter(([k]) => data[k]).map(([k, label]) => `*${label}:* ${data[k]}`);
  const msg = `*${TITLE}*\n\n${lines.join('\n')}`;
  const u = new URL('https://api.callmebot.com/whatsapp.php');
  u.searchParams.set('phone', env.WHATSAPP_PHONE);
  u.searchParams.set('apikey', env.CALLMEBOT_APIKEY);
  u.searchParams.set('text', msg);
  const res = await fetch(u);
  if (!res.ok) throw new Error('whatsapp ' + res.status + ' ' + await res.text());
}

export default {
  async fetch(req, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Vary': 'Origin',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
    if (allowed !== '*' && req.headers.get('Origin') !== allowed) return json({ ok: false, error: 'origin' }, 403);

    let raw;
    try { raw = await req.json(); } catch { return json({ ok: false, error: 'json' }, 400); }

    /* honeypot: los bots rellenan el campo oculto "website" */
    if (clean(raw.website)) return json({ ok: true });

    const data = Object.fromEntries(FIELDS.map(([k]) => [k, clean(raw[k])]));
    data.idioma = data.idioma.toUpperCase();
    if (!emailRe.test(data.email) || !telRe.test(data.telefono)) return json({ ok: false, error: 'invalid' }, 400);

    const tasks = [];
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) tasks.push(sendTelegram(env, data));
    if (env.WHATSAPP_PHONE && env.CALLMEBOT_APIKEY) tasks.push(sendWhatsApp(env, data));
    if (!tasks.length) return json({ ok: false, error: 'not configured' }, 500);

    const results = await Promise.allSettled(tasks);
    results.filter(r => r.status === 'rejected').forEach(r => console.error(r.reason));
    /* basta con que llegue por uno de los dos canales */
    return results.some(r => r.status === 'fulfilled') ? json({ ok: true }) : json({ ok: false, error: 'delivery' }, 502);
  },
};
