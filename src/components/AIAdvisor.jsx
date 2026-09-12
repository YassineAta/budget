import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import {
  callDeep, callLite, getApiKey, setApiKey, clearApiKey,
  deepUsageToday, DEEP_RPD_CAP,
} from '../utils/aiClient';
import { systemPrompt, prioritiesPrompt, monthlyReviewPrompt } from '../utils/aiAdvisor';
import { IconBrain, IconSparkles, IconChart, IconEdit, IconX, IconCheckCircle } from './icons';

function renderText(text) {
  return text.split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

function KeySetup({ onSave }) {
  const [val, setVal] = useState('');
  return (
    <div className="card subtle">
      <div className="card-title"><IconBrain /> Activate AI Advisor</div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', lineHeight: 1.6 }}>
        Paste your Gemini API key to enable your personal financial advisor.
        Your key is stored locally in this browser only — never sent anywhere except Google.
      </p>
      <div className="input-row">
        <input
          type="password"
          placeholder="AIzaSy..."
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && val && onSave(val)}
        />
        <button className="btn btn-primary btn-sm" disabled={!val} onClick={() => onSave(val)}>
          <IconCheckCircle /> Save
        </button>
      </div>
    </div>
  );
}

const WELCOME = "Hi! I have your full financial picture — goals, spending history, burn rate, and runway. Ask me anything, or use the buttons above for a monthly review or to generate your priorities profile.";

export default function AIAdvisor() {
  const { state, dispatch } = useStore();
  const [hasKey, setHasKey] = useState(!!getApiKey());
  const [messages, setMessages] = useState([{ role: 'model', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(null); // 'chat' | 'review' | 'priorities'
  const [error, setError] = useState(null);
  const [deepUsed, setDeepUsed] = useState(deepUsageToday());
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function handleSaveKey(k) {
    setApiKey(k);
    setHasKey(true);
  }

  function handleClearKey() {
    clearApiKey();
    setHasKey(false);
  }

  function push(role, text) {
    setMessages(prev => [...prev, { role, text }]);
  }

  function buildContents(userText) {
    const contents = messages.slice(1).map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));
    contents.push({ role: 'user', parts: [{ text: userText }] });
    return contents;
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    push('user', text);
    setLoading('chat');
    try {
      const reply = await callLite(buildContents(text), systemPrompt(state));
      push('model', reply);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
      inputRef.current?.focus();
    }
  }

  async function doMonthlyReview() {
    if (loading) return;
    setError(null);
    setLoading('review');
    try {
      const contents = [{ role: 'user', parts: [{ text: monthlyReviewPrompt(state) }] }];
      const reply = await callDeep(contents, systemPrompt(state));
      push('model', `**Monthly Review**\n\n${reply}`);
      setDeepUsed(deepUsageToday());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function doLearnPriorities() {
    if (loading) return;
    setError(null);
    setLoading('priorities');
    try {
      const contents = [{ role: 'user', parts: [{ text: prioritiesPrompt(state) }] }];
      const profile = await callDeep(contents, systemPrompt(state));
      dispatch({ type: 'SET_AI_PROFILE', updates: { priorities: profile, lastPrioritiesAt: new Date().toISOString() } });
      push('model', `**Priorities Profile Updated**\n\n${profile}`);
      setDeepUsed(deepUsageToday());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  if (!hasKey) return <KeySetup onSave={handleSaveKey} />;

  const deepLeft = DEEP_RPD_CAP - deepUsed;

  return (
    <div>
      {/* Action bar */}
      <div className="row mb-3" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm btn-blue"
          onClick={doMonthlyReview}
          disabled={!!loading || deepLeft <= 0}
          title={`${deepLeft} deep analyses left today`}
        >
          <IconChart /> Monthly Review
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={doLearnPriorities}
          disabled={!!loading || deepLeft <= 0}
          title={`${deepLeft} deep analyses left today`}
        >
          <IconSparkles /> Learn My Priorities
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', alignSelf: 'center' }}>
          Deep: {deepLeft}/{DEEP_RPD_CAP} today
        </span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={handleClearKey} title="Change API key">
          <IconEdit />
        </button>
      </div>

      {/* Priorities profile */}
      {state.aiProfile?.priorities && (
        <div className="card subtle mb-3" style={{ borderLeft: '3px solid var(--purple)', borderRadius: 'var(--radius-sm)' }}>
          <div className="card-title" style={{ color: 'var(--purple)' }}>
            <IconSparkles /> Your Priorities Profile
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {state.aiProfile.priorities}
          </p>
          {state.aiProfile.lastPrioritiesAt && (
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', marginTop: 'var(--space-2)' }}>
              Last updated {new Date(state.aiProfile.lastPrioritiesAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-danger mb-3">
          <IconX />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setError(null)}>
            <IconX />
          </button>
        </div>
      )}

      {/* Chat window */}
      <div className="ai-chat-window">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            {m.role === 'model' && (
              <div className="ai-msg-icon"><IconBrain /></div>
            )}
            <div className="ai-msg-bubble" style={{ whiteSpace: 'pre-wrap' }}>
              {renderText(m.text)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg-model">
            <div className="ai-msg-icon"><IconBrain /></div>
            <div className="ai-msg-bubble ai-thinking">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="input-row mt-3">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask anything about your finances…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
          disabled={!!loading}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={sendChat}
          disabled={!input.trim() || !!loading}
        >
          Send
        </button>
      </div>
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', marginTop: 'var(--space-1)' }}>
        Chat → Gemini 2.5 Flash (250 req/day free) · Review / Priorities → Gemini 2.5 Pro (100 req/day free)
      </div>
    </div>
  );
}
