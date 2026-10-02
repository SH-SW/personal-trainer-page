# Form notifications → Telegram + WhatsApp

When someone submits the contact form, this Cloudflare Worker sends Alex an instant
message on **Telegram** and **WhatsApp** with the client's details.

```
browser form ──POST JSON──▶ Cloudflare Worker ──▶ Telegram Bot API  ──▶ Alex's Telegram
                             (holds the secrets) └─▶ CallMeBot API   ──▶ Alex's WhatsApp
```

The tokens never appear in the public web page, so nobody can copy them from the page source.

## 1. Telegram bot (≈2 min)

1. In Telegram, open **@BotFather**, send `/newbot`, and pick a name and username.
   BotFather replies with a **bot token** such as `123456:ABC-...`.
2. From **Alex's account (@Machiavelli3)**, open the new bot and press **Start**.
   A bot can't send the first message, so Alex has to start the chat.
3. In a browser, open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the
   number in `"chat":{"id": 123456789 ...}`. That number is the **chat id**.

## 2. WhatsApp via CallMeBot (≈2 min, free)

1. On Alex's phone (+34 617 111 232), add the CallMeBot WhatsApp number shown on
   <https://www.callmebot.com/blog/free-api-whatsapp-messages/> to the contacts.
2. Send it this message: `I allow callmebot to send me messages`
3. CallMeBot replies with an **apikey**.

> CallMeBot is a free service for messaging your own number. For a fully official route,
> use the Meta WhatsApp Cloud API instead. It needs a Meta Business account and an
> approved message template, and only `sendWhatsApp()` in `worker.js` would change.

## 3. Deploy the Worker

```bash
cd notify-worker
npx wrangler login
npx wrangler secret put TELEGRAM_BOT_TOKEN   # paste the BotFather token
npx wrangler secret put TELEGRAM_CHAT_ID     # paste the chat id
npx wrangler secret put WHATSAPP_PHONE       # 34617111232
npx wrangler secret put CALLMEBOT_APIKEY     # paste the CallMeBot apikey
npx wrangler deploy
```

`deploy` prints a URL like `https://alex-form-notify.<your-subdomain>.workers.dev`.

In `wrangler.toml`, set `ALLOWED_ORIGIN` to the site's domain (for example
`https://sh-sw.github.io`) so that only your page can use the Worker. Then deploy again.

## 4. Connect the page

In `alex-es/index.html`, set:

```js
const FORM_ENDPOINT = "https://alex-form-notify.<your-subdomain>.workers.dev";
```

## Test

```bash
curl -X POST "$URL" -H 'Content-Type: application/json' \
  -d '{"nombre":"Test","email":"test@example.com","telefono":"+34600000000","idioma":"es"}'
```

The response should be `{"ok":true}`, and the message should arrive on both apps.
If only one channel is set up, the Worker still works with that one.
Errors show up in `npx wrangler tail`.
