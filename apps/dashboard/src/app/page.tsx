'use client';

import { useState, useRef, useEffect } from 'react';

const AGENT_COLORS: Record<string, string> = {
  cypher:   '#6aa8ff',
  orion:    '#7ee8a2',
  sable:    '#f5c842',
  vesper:   '#c084fc',
  morrigan: '#f97316',
  theron:   '#38bdf8',
  hermes:   '#fb7185',
};

const AGENT_LABELS: Record<string, string> = {
  cypher:   'CYPHER',
  orion:    'ORION',
  sable:    'SABLE',
  vesper:   'VESPER',
  morrigan: 'MORRIGAN',
  theron:   'THERON',
  hermes:   'HERMES',
};

type Message = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  agent?: string;
  intent?: string;
  memory_injected?: boolean;
  ts: Date;
};

export default function CypherChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'agent',
      agent: 'cypher',
      text: 'Standing by. What do you need?',
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text, ts: new Date() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/cypher/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, session_id: sessionId }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          agent: data.agent || 'cypher',
          intent: data.intent,
          memory_injected: data.memory_injected,
          text: data.reply || data.error || 'No response.',
          ts: new Date(),
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'agent', agent: 'cypher', text: 'Connection error.', ts: new Date() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0a0a0a', color: '#e8e8e8', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', borderBottom: '1px solid #1e1e1e',
        // @ts-ignore
        WebkitAppRegion: 'drag',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'linear-gradient(135deg, #6aa8ff, #c084fc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#0a0a0a',
        }}>C</div>
        <span style={{ fontWeight: 600, letterSpacing: '.08em', fontSize: 13 }}>CYPHER</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#444' }}>
          Personal Intelligence System
        </span>
      </header>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'agent' && msg.agent && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: AGENT_COLORS[msg.agent] || '#6aa8ff',
                  }} />
                  <span style={{ fontSize: 10, letterSpacing: '.12em', color: AGENT_COLORS[msg.agent] || '#6aa8ff', fontWeight: 600 }}>
                    {AGENT_LABELS[msg.agent] || msg.agent.toUpperCase()}
                  </span>
                  {msg.intent && (
                    <span style={{ fontSize: 10, color: '#444', marginLeft: 4 }}>· {msg.intent}</span>
                  )}
                  {msg.memory_injected && (
                    <span style={{ fontSize: 10, color: '#333', marginLeft: 4 }}>· ◎ memory</span>
                  )}
                </div>
              )}
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                background: msg.role === 'user' ? '#1a2a3a' : '#141414',
                border: `1px solid ${msg.role === 'user' ? '#1e3a5a' : '#1e1e1e'}`,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </div>
              <span style={{ fontSize: 10, color: '#333', marginTop: 4 }}>
                {msg.ts.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: '#6aa8ff',
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: '#444' }}>thinking</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #1e1e1e' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything…"
            rows={1}
            autoFocus
            style={{
              flex: 1, resize: 'none', background: '#141414',
              border: '1px solid #2a2a2a', borderRadius: 10,
              color: '#e8e8e8', padding: '10px 14px', fontSize: 14,
              lineHeight: 1.5, outline: 'none', fontFamily: 'inherit',
              maxHeight: 120, overflowY: 'auto',
            }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: loading || !input.trim() ? '#1e1e1e' : '#6aa8ff',
              color: loading || !input.trim() ? '#444' : '#0a0a0a',
              fontWeight: 600, fontSize: 13, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            Send
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 10, color: '#2a2a2a', marginTop: 8 }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        @keyframes pulse {
          0%, 100% { opacity: .3; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        textarea:focus { border-color: #3a3a3a !important; }
      `}</style>
    </div>
  );
}
