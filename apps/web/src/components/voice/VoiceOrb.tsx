/**
 * VoiceOrb
 *
 * Always-visible floating orb in the bottom-right of the cockpit.
 * Pulses cyan when listening, pulses white when speaking, dim when idle.
 * Click to toggle — or use the global Cmd+Shift+Space hotkey.
 *
 * States:
 *   idle      — dim blue ring, mic icon
 *   listening — pulsing cyan glow, animated mic
 *   speaking  — pulsing white glow, waveform bars, agent name shown
 *   error     — red tint
 */
'use client';

import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import { AGENT_VOICES } from '@/lib/voice/voices';

const AGENT_COLORS: Record<string, string> = {
  cypher:   '#6aa8ff',
  orion:    '#4cd9a0',
  sable:    '#ffd97d',
  vesper:   '#f0a8ff',
  morrigan: '#ff8c69',
  theron:   '#a8d8ff',
  hermes:   '#7dffb3',
};

export default function VoiceOrb() {
  const { isListening, isSpeaking, activeAgent, error, toggleListening } = useVoiceAgent();

  const agentColor = activeAgent ? (AGENT_COLORS[activeAgent] ?? '#6aa8ff') : '#6aa8ff';
  const voiceName  = activeAgent ? AGENT_VOICES[activeAgent]?.name ?? activeAgent : null;

  const orbClass = error
    ? 'orb-error'
    : isListening
    ? 'orb-listening'
    : isSpeaking
    ? 'orb-speaking'
    : 'orb-idle';

  return (
    <>
      <style>{`
        .voice-orb-wrap {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }

        /* Agent name label */
        .voice-agent-label {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--agent-color);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .voice-agent-label.visible { opacity: 1; }

        /* Orb button */
        .voice-orb {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 2px solid transparent;
          background: #111;
          cursor: pointer;
          pointer-events: all;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
          position: relative;
          outline: none;
        }

        /* Idle */
        .orb-idle {
          border-color: #2a3a5a;
          box-shadow: 0 0 0 0 transparent;
        }
        .orb-idle:hover {
          border-color: #6aa8ff55;
          box-shadow: 0 0 12px #6aa8ff22;
        }

        /* Listening */
        .orb-listening {
          border-color: var(--agent-color);
          box-shadow: 0 0 0 0 var(--agent-color);
          animation: pulse-listen 1.2s ease-out infinite;
        }
        @keyframes pulse-listen {
          0%   { box-shadow: 0 0 0 0 var(--agent-color); }
          70%  { box-shadow: 0 0 0 14px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }

        /* Speaking */
        .orb-speaking {
          border-color: var(--agent-color);
          box-shadow: 0 0 18px var(--agent-color), 0 0 36px var(--agent-color33);
          animation: pulse-speak 0.9s ease-in-out infinite alternate;
        }
        @keyframes pulse-speak {
          from { box-shadow: 0 0 12px var(--agent-color), 0 0 24px var(--agent-color33); }
          to   { box-shadow: 0 0 22px var(--agent-color), 0 0 44px var(--agent-color33); }
        }

        /* Error */
        .orb-error {
          border-color: #ff4444;
          box-shadow: 0 0 12px #ff444466;
        }

        /* Mic icon (idle / listening) */
        .orb-mic {
          width: 22px;
          height: 22px;
          opacity: 0.7;
          transition: opacity 0.3s;
        }
        .orb-listening .orb-mic { opacity: 1; animation: mic-bounce 0.6s ease-in-out infinite alternate; }
        @keyframes mic-bounce { from { transform: scale(1); } to { transform: scale(1.15); } }

        /* Waveform bars (speaking) */
        .orb-bars {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 22px;
        }
        .orb-bar {
          width: 3px;
          border-radius: 2px;
          background: var(--agent-color);
          animation: bar-bounce 0.8s ease-in-out infinite alternate;
        }
        .orb-bar:nth-child(1) { height: 8px;  animation-delay: 0s; }
        .orb-bar:nth-child(2) { height: 14px; animation-delay: 0.12s; }
        .orb-bar:nth-child(3) { height: 20px; animation-delay: 0.06s; }
        .orb-bar:nth-child(4) { height: 14px; animation-delay: 0.18s; }
        .orb-bar:nth-child(5) { height: 8px;  animation-delay: 0.03s; }
        @keyframes bar-bounce {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1); }
        }

        /* Keyboard hint */
        .voice-hint {
          font-family: 'SF Mono', monospace;
          font-size: 10px;
          color: #3a4a6a;
          letter-spacing: 0.05em;
          pointer-events: none;
        }
      `}</style>

      <div
        className="voice-orb-wrap"
        style={{ '--agent-color': agentColor } as React.CSSProperties}
      >
        {/* Agent label — visible when active */}
        <span className={`voice-agent-label ${(isListening || isSpeaking) && voiceName ? 'visible' : ''}`}>
          {voiceName ?? 'CYPHER'}
        </span>

        {/* Orb button */}
        <button
          className={`voice-orb ${orbClass}`}
          onClick={toggleListening}
          title={isListening ? 'Stop listening (⌘⇧Space)' : 'Start listening (⌘⇧Space)'}
          aria-label="Voice agent toggle"
        >
          {isSpeaking ? (
            /* Waveform when speaking */
            <div className="orb-bars">
              <div className="orb-bar" />
              <div className="orb-bar" />
              <div className="orb-bar" />
              <div className="orb-bar" />
              <div className="orb-bar" />
            </div>
          ) : (
            /* Mic icon when idle / listening */
            <svg className="orb-mic" viewBox="0 0 24 24" fill="none" stroke={isListening ? agentColor : '#4a6a9a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="21" />
              <line x1="9" y1="21" x2="15" y2="21" />
            </svg>
          )}
        </button>

        {/* Keyboard shortcut hint */}
        <span className="voice-hint">⌘⇧Space</span>
      </div>
    </>
  );
}
