/**
 * CYPHER Voice Registry
 *
 * Each agent has a unique ElevenLabs voice that matches their personality.
 * All voices use eleven_turbo_v2_5 — ~75ms latency, optimised for real-time.
 *
 * Voice character guide:
 *   Cypher   — Daniel   British, deep, calm authority → closest to Jarvis
 *   Orion    — Harry    British, technical edge, decisive
 *   Sable    — George   Authoritative, measured — finance gravitas
 *   Vesper   — Rachel   Warm, clear — personal assistant energy
 *   Morrigan — Liam     Young, energetic, persuasive — marketing
 *   Theron   — Adam     Analytical, patient — research & synthesis
 *   Hermes   — Charlie  Quick, crisp, antipodean — comms & memory
 */

export interface AgentVoice {
  voice_id: string;
  name: string;        // ElevenLabs voice name — for reference
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export const AGENT_VOICES: Record<string, AgentVoice> = {
  cypher: {
    voice_id: 'onwK4e9ZLuTAKqWW03F9', // Daniel — deep British, calm authority
    name: 'Daniel',
    stability: 0.55,          // slightly less variable = more Jarvis-like consistency
    similarity_boost: 0.80,
    style: 0.10,              // tiny style boost for gravitas
    use_speaker_boost: true,
  },
  orion: {
    voice_id: 'SOYHLrjzK2X1ezoPC6cr', // Harry — British, technical
    name: 'Harry',
    stability: 0.65,
    similarity_boost: 0.75,
    style: 0.05,
    use_speaker_boost: true,
  },
  sable: {
    voice_id: 'JBFqnCBsd6RMkjVDRZzb', // George — authoritative, financial gravitas
    name: 'George',
    stability: 0.70,
    similarity_boost: 0.75,
    style: 0.00,
    use_speaker_boost: true,
  },
  vesper: {
    voice_id: '21m00Tcm4TlvDq8ikWAM', // Rachel — warm, personal assistant
    name: 'Rachel',
    stability: 0.55,
    similarity_boost: 0.75,
    style: 0.05,
    use_speaker_boost: true,
  },
  morrigan: {
    voice_id: 'TX3LPaxmHKxFdv7VOQHJ', // Liam — energetic, marketing
    name: 'Liam',
    stability: 0.45,
    similarity_boost: 0.75,
    style: 0.15,
    use_speaker_boost: true,
  },
  theron: {
    voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam — analytical, measured
    name: 'Adam',
    stability: 0.75,
    similarity_boost: 0.80,
    style: 0.00,
    use_speaker_boost: false,
  },
  hermes: {
    voice_id: 'IKne3meq5aSn9XLyUdCD', // Charlie — quick, crisp, Australian
    name: 'Charlie',
    stability: 0.50,
    similarity_boost: 0.75,
    style: 0.05,
    use_speaker_boost: true,
  },
};

/** Model to use for all TTS — turbo = ~75ms first audio */
export const ELEVENLABS_MODEL = 'eleven_turbo_v2_5';

/** Fallback voice when agent has no mapping */
export const DEFAULT_VOICE = AGENT_VOICES.cypher;

export function getVoice(agentId: string): AgentVoice {
  return AGENT_VOICES[agentId] ?? DEFAULT_VOICE;
}
