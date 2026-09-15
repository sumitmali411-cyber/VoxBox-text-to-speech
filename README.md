<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0222fe34-0153-4a4e-a709-5ee0809b6e49

## Architecture

The app has two parts:

- **`src/`** — the React client. It has no API credentials of any kind.
- **`server/`** — a small Express server that holds `GEMINI_API_KEY` and exposes
  a single validated endpoint, `POST /api/tts`.

The client calls `/api/tts`; the server calls Gemini. The key never reaches the
browser. **Do not** add the key to `vite.config.ts` via `define` or to any
`VITE_`-prefixed variable — both are inlined into the JavaScript bundle and are
readable by anyone who loads the page.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to your Gemini API key
3. Run the app (starts the API server and the Vite dev server together):
   `npm run dev`

The client runs on port 3000 and proxies `/api` to the server on port 8080.
To run them separately, use `npm run dev:server` and `npm run dev:client`.

## Production

```
npm run build   # builds the client into dist/
npm start       # serves dist/ and the API from one Express process
```

## Security notes

- `GEMINI_API_KEY` is server-only. Keep `.env*` out of version control (it is
  already in `.gitignore`).
- `/api/tts` validates the voice against an allowlist, caps request text at
  2000 characters, caps request bodies at 64 KB, and rate-limits each client to
  60 requests per minute. Adjust these in `server/index.ts` if you need to.
- Uploaded PDFs are parsed with `isEvalSupported: false` and XFA disabled, so a
  hostile document cannot execute script during text extraction.
- Run `npm run audit` to check dependencies for known vulnerabilities.
