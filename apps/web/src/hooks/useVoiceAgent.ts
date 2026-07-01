/**
 * useVoiceAgent
 *
 * Full voice pipeline:
 *   Mic → Web Speech API (STT) → /api/cypher/stream (LLM SSE) → /api/tts (ElevenLabs) → Web Audio
 *
 * Sentence-level streaming: TTS starts on the FIRST sentence while the LLM
 * is still generating the rest — keeps perceived latency under ~700ms.
 *
 * Activation:
 *   - Toggle: call toggleListening() or respond to Electron IPC voiceToggle event
 *   - Visual state exposed: isListening, isSpeaking, transcript, activeAgent
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Extend Window for Electron IPC bridge
declare global {
  interface Window {
    cypher?: {
      version?: string;
      platform?: string;
      onVoiceToggle?: (cb: () => void) => void;
    };
  }
}

export interface VoiceAgentState {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  activeAgent: string | null;
  error: string | null;
  toggleListening: () => void;
  stopAll: () => void;
}

export function useVoiceAgent(): VoiceAgentState {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<unknown | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const nextStartRef   = useRef<number>(0);       // next audio chunk start time in AudioContext
  const audioQueueRef  = useRef<Promise<void>>(Promise.resolve()); // serialise playback
  const activeStreamRef = useRef<AbortController | null>(null);
  const speakingCountRef = useRef<number>(0);     // pending audio chunks

  // ── Audio context (lazy) ──────────────────────────────────────────────────
  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      nextStartRef.current = 0;
    }
    return audioCtxRef.current;
  }

  // ── Play a single audio chunk ─────────────────────────────────────────────
  const playChunk = useCallback((buffer: ArrayBuffer): Promise<void> => {
    return new Promise((resolve) => {
      const ctx = getAudioCtx();

      ctx.decodeAudioData(buffer).then((audioBuffer) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        // Schedule gapless after previous chunk
        const startAt = Math.max(ctx.currentTime, nextStartRef.current);
        source.start(startAt);
        nextStartRef.current = startAt + audioBuffer.duration;

        speakingCountRef.current++;
        setIsSpeaking(true);

        source.onended = () => {
          speakingCountRef.current = Math.max(0, speakingCountRef.current - 1);
          if (speakingCountRef.current === 0) setIsSpeaking(false);
          resolve();
        };
      }).catch((err) => {
        console.error('[voice] decode error:', err);
        resolve();
      });
    });
  }, []);

  // ── Fetch TTS audio for a sentence and queue it ───────────────────────────
  const speakSentence = useCallback((sentence: string, agentId: string) => {
    // Chain onto the audio queue so chunks play in order
    audioQueueRef.current = audioQueueRef.current.then(async () => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sentence, agent_id: agentId }),
        });
        if (!res.ok) { console.warn('[voice] TTS failed', res.status); return; }
        const buffer = await res.arrayBuffer();
        await playChunk(buffer);
      } catch (err) {
        console.error('[voice] TTS error:', err);
      }
    });
  }, [playChunk]);

  // ── Cancel all in-flight audio ────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    speakingCountRef.current = 0;
    nextStartRef.current = 0;
    audioQueueRef.current = Promise.resolve();
    setIsSpeaking(false);
  }, []);

  // ── Send transcript to streaming LLM ─────────────────────────────────────
  const processTranscript = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    // Abort any previous stream
    activeStreamRef.current?.abort();
    activeStreamRef.current = new AbortController();
    stopAudio();
    setTranscript(userText);

    try {
      console.log('[voice] sending to stream:', userText);
      const res = await fetch('/api/cypher/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
        signal: activeStreamRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        console.error('[voice] stream failed:', res.status, errText);
        setError(`Stream ${res.status}`); return;
      }
      console.log('[voice] stream connected, reading...');

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'agent')    { console.log('[voice] agent:', evt.agent); setActiveAgent(evt.agent); }
            if (evt.type === 'sentence') { console.log('[voice] sentence:', evt.text); speakSentence(evt.text, evt.agent); }
            if (evt.type === 'error')    { console.error('[voice] stream error event:', evt.message); setError(evt.message); }
            if (evt.type === 'done')     console.log('[voice] done');
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[voice] stream error:', err);
        setError((err as Error)?.message || 'Unknown error');
      }
    }
  }, [speakSentence, stopAudio]);

  // ── Web Speech API setup ──────────────────────────────────────────────────
  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as any;
    if (!SR) { setError('Speech recognition not available'); return; }

    const rec = new SR();
    rec.lang              = 'en-NZ'; // Tasman's locale
    rec.continuous        = false;   // single utterance per activation
    rec.interimResults    = false;
    rec.maxAlternatives   = 1;

    rec.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript || '';
      console.log('[voice] STT result:', text);
      if (text) processTranscript(text);
    };

    rec.onerror = (e: any) => {
      console.error('[voice] STT error:', e.error);
      if (e.error !== 'no-speech') setError(`Speech error: ${e.error}`);
      setIsListening(false);
    };

    rec.onend = (e: any) => {
      console.log('[voice] STT ended');
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
    console.log('[voice] STT started, lang:', rec.lang);
    setIsListening(true);
    setError(null);
  }, [processTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      // Stop any playing audio before starting to listen
      stopAudio();
      startListening();
    }
  }, [isListening, startListening, stopListening, stopAudio]);

  const stopAll = useCallback(() => {
    stopListening();
    stopAudio();
    activeStreamRef.current?.abort();
  }, [stopListening, stopAudio]);

  // ── Electron global hotkey IPC ────────────────────────────────────────────
  useEffect(() => {
    // Electron preload exposes window.cypher.onVoiceToggle
    if (typeof window !== 'undefined' && window.cypher?.onVoiceToggle) {
      window.cypher.onVoiceToggle(toggleListening);
    }
  }, [toggleListening]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { stopAll(); };
  }, [stopAll]);

  return { isListening, isSpeaking, transcript, activeAgent, error, toggleListening, stopAll };
}
