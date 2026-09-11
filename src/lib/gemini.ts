export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export const VOICE_NAMES: readonly VoiceName[] = [
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Zephyr',
];

/** Audio types the player will construct a data: URL for. */
const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/webm',
  'audio/pcm',
  'audio/L16',
];

export interface TTSOptions {
  voiceName: VoiceName;
}

/**
 * Rejects anything that is not a recognised audio type, so a compromised or
 * unexpected response cannot be turned into an arbitrary data: URL.
 */
export function isAllowedAudioMimeType(mimeType: string): boolean {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return ALLOWED_AUDIO_MIME_TYPES.some((allowed) => allowed.toLowerCase() === base);
}

/**
 * Requests speech from the server-side proxy. The Gemini API key stays on the
 * server and is never exposed to the browser bundle.
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions,
): Promise<{ data: string; mimeType: string }> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName: options.voiceName }),
  });

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { error?: string }) => body?.error)
      .catch(() => undefined);
    throw new Error(message || 'Speech generation failed.');
  }

  const { data, mimeType } = (await response.json()) as {
    data?: string;
    mimeType?: string;
  };

  if (typeof data !== 'string' || !data) {
    throw new Error('No audio data received from the server.');
  }

  const resolvedMimeType = typeof mimeType === 'string' ? mimeType : 'audio/wav';
  if (!isAllowedAudioMimeType(resolvedMimeType)) {
    throw new Error('Server returned an unsupported audio format.');
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('Server returned malformed audio data.');
  }

  return { data, mimeType: resolvedMimeType };
}
