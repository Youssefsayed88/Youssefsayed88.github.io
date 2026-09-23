# portfolio-chat

The chatbot's back end: a Cloudflare Worker that holds the Gemini API key, so
it never reaches a browser. The site sends `POST /chat { messages }` and gets
the reply back as a plain-text stream. See `src/index.js` for what it accepts
and how it is guarded, and `../src/chat/context.js` for what the bot knows.

## When to redeploy

**After any change to `src/data/` or `src/chat/context.js`**, and after any
change in this folder. The bot's knowledge is bundled in at deploy time, so
pushing the site is not enough: until you run `npx wrangler deploy` here, the
robot keeps answering from the old content.

```sh
cd worker
npx wrangler deploy
```

## First-time setup

```sh
cd worker
npm install
npx wrangler login                          # opens the browser; click Allow
npx wrangler deploy                         # prints the URL
npx wrangler secret put GEMINI_API_KEY      # paste the key from aistudio.google.com
```

Then set the repository variable `CHAT_URL` to that URL plus `/chat`
(Settings → Secrets and variables → Actions → Variables) and re-run the site's
deploy. Without `CHAT_URL` the site builds with no chat at all.

The bot answers from `src/data`, bundled in at deploy time, so a project added
there reaches the bot on the next `npx wrangler deploy`.

## When something goes wrong

- **Slow or failing replies**: `npx wrangler tail`, then ask a question. Each
  reply logs which model answered and after how long; failures log the model
  and its status (503 busy, 404 retired, 429 quota). The model list is at the
  top of `src/index.js`. Free Gemini models come and go, so swap a model that
  keeps failing for a newer one.
- **Cloudflare error 1102**: the free plan's 10 ms CPU limit. Requests
  measured 6-11 ms on 2026-09-23.
- **"This chat only answers on the portfolio itself"**: the page's origin is
  not in `ALLOWED_ORIGINS` (`wrangler.jsonc`).

## Test

```sh
npm test    # request handling, with Gemini and Workers AI stubbed out
```

To run it locally against the real models, put `GEMINI_API_KEY=…` and
`ALLOWED_ORIGINS=http://localhost:5173` in `.dev.vars` (ignored by git), run
`npm run dev`, and build the site with `CHAT_URL=http://127.0.0.1:8787/chat`.
