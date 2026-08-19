import { useState, type FormEvent } from 'react';
import { Bot, Loader2, RotateCcw, Send, UserRound } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { aiTestApi } from '../services/api';
import './AiTestChat.css';

type ChatTurn = { role: 'customer' | 'assistant'; text: string; action?: string };

export function AiTestChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState('');

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setMessage(''); setError(''); setSending(true);
    const history = turns.map(({ role, text: turnText }) => ({ role, text: turnText }));
    setTurns(current => [...current, { role: 'customer', text }]);
    try {
      const result = await aiTestApi.chat(text, history);
      setProvider(result.provider); setModel(result.model);
      setTurns(current => [...current, { role: 'assistant', text: result.reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The AI provider test failed.');
    } finally { setSending(false); }
  };

  return <div className="ai-test-page"><PageHeader title="Test AI agent" subtitle="Practice the order-confirmation conversation without sending WhatsApp messages or changing a real order" />
    <div className="ai-test-shell">
      <div className="ai-test-toolbar"><div><Bot size={18}/><span><strong>{provider || 'Configured provider'}</strong><small>{model || 'Send a message to verify the connection'}</small></span></div><button onClick={() => { setTurns([]); setError(''); }}><RotateCcw size={16}/> New test</button></div>
      <div className="ai-test-order"><strong>Sample order #1234</strong><span>2 × Test product</span><span>300 MAD · Casablanca</span></div>
      <div className="ai-test-messages">
        {!turns.length && <div className="ai-test-empty"><Bot size={38}/><h3>Start a test conversation</h3><p>Try asking for the total, confirming, cancelling, or requesting an address change.</p><div><button onClick={() => setMessage('What is the total of my order?')}>Ask total</button><button onClick={() => setMessage('Yes, I confirm my order.')}>Confirm</button><button onClick={() => setMessage('I want to change my address.')}>Request change</button></div></div>}
        {turns.map((turn, index) => <div className={`ai-test-message ${turn.role}`} key={index}>{turn.role === 'assistant' ? <Bot size={18}/> : <UserRound size={18}/>}<div>{turn.action && <span className={`ai-action ${turn.action}`}>{turn.action}</span>}<p>{turn.text}</p></div></div>)}
        {sending && <div className="ai-test-message assistant"><Loader2 className="animate-spin" size={18}/><p>Thinking…</p></div>}
      </div>
      {error && <div className="ai-test-error">{error}</div>}
      <form className="ai-test-composer" onSubmit={send}><input value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder="Write a customer reply…"/><button disabled={sending || !message.trim()}><Send size={18}/> Send</button></form>
    </div>
  </div>;
}
