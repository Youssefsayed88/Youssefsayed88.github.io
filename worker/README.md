# portfolio-chat

The chatbot's back end: a Cloudflare Worker that holds the Gemini API key, so
it never reaches a browser. The site sends `POST /chat { messages }` and gets
the reply back as a plain-text stream. See `src/index.js` for what it accepts
and how it is guarded, and `../src/chat/context.js` for what the bot knows.

## Deploy (once, then whenever the prompt or the portfolio data changes)

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

## Test

```sh
npm test    # request handling, with Gemini and Workers AI stubbed out
```

To run it locally against the real models, put `GEMINI_API_KEY=…` and
`ALLOWED_ORIGINS=http://localhost:5173` in `.dev.vars` (ignored by git), run
`npm run dev`, and build the site with `CHAT_URL=http://127.0.0.1:8787/chat`.
