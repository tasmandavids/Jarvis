/**
 * POST /api/tts
 *
 * Streaming ElevenLabs TTS proxy.
 * Keeps the API key server-side; returns raw audio/mpeg stream.
 *
 * Body: { text: string; agent_id: string }
 * Response: audio/mpeg stream
 */
import { NextRequest, NextResponse } from 'next/server';
import { getVoice, ELEVENLABS_MODEL } from '@/lib/voice/voices';

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

export async function POST(req: NextRequest) {
  const { text, agent_id } = await req.json().catch(() => ({}));

  if (!text?.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 503 });
  }

  const voice = getVoice(agent_id || 'cypher');

  const upstream = await fetch(
    `${ELEVEN_BASE}/text-to-speech/${voice.voice_id}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: voice.stability,
          similarity_boost: voice.similarity_boost,
          style: voice.style,
          use_speaker_boost: voice.use_speaker_boost,
        },
        // Optimise for streaming — send audio as soon as possible
        optimize_streaming_latency: 4,
      }),
    }
  );

  if (!upstream.ok) {
    const err = await upstream.text();
    console.error('[tts] ElevenLabs error:', upstream.status, err);
    return NextResponse.json(
      { error: `ElevenLabs ${upstream.status}` },
      { status: upstream.status }
    );
  }

  // Pipe the stream straight back — no buffering
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Cypher-Voice': voice.name,
    },
  });
}
