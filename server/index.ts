/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local takes precedence; dotenv never overwrites an already-set value.
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = Number(process.env.PORT) || 8080;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error(
    'GEMINI_API_KEY is not set. Create a .env.local with GEMINI_API_KEY=<your key> before starting the server.',
  );
  process.exit(1);
}

// The key lives only in this process. It is never sent to the browser.
const ai = new GoogleGenAI({ apiKey: API_KEY });

/** Voices the upstream model accepts. Anything else is rejected. */
const ALLOWED_VOICES = new Set([
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Zephyr',
]);

/** Upper bound on a single synthesis request, in characters. */
const MAX_TEXT_LENGTH = 2000;

/** Rate limit: requests allowed per client per window. */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const app = express();

app.disable('x-powered-by');

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Tailwind and the animation library write inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Generated speech is handed to <audio> as a data: URL.
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // pdf.js loads its worker from a bundled blob URL.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  next();
});

// Reject oversized bodies before they are buffered into memory.
app.use(express.json({ limit: '64kb' }));

const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// Drop expired buckets so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

app.post('/api/tts', async (req, res) => {
  if (rateLimited(req.ip ?? 'unknown')) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  const { text, voiceName } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'A non-empty "text" string is required.' });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res
      .status(413)
      .json({ error: `"text" must be ${MAX_TEXT_LENGTH} characters or fewer.` });
  }

  if (typeof voiceName !== 'string' || !ALLOWED_VOICES.has(voiceName)) {
    return res.status(400).json({ error: 'Unknown voice.' });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const inlineData =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!inlineData?.data) {
      return res.status(502).json({ error: 'No audio was returned by the speech model.' });
    }

    return res.json({
      data: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/wav',
    });
  } catch (error) {
    // Log server-side; return a generic message so upstream errors (which can
    // echo request details or key metadata) never reach the browser.
    console.error('TTS generation failed:', error);
    return res.status(502).json({ error: 'Speech generation failed. Please try again.' });
  }
});

// Serve the production build. In development Vite serves the client and
// proxies /api to this process.
const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VoxBook API listening on http://localhost:${PORT}`);
});
