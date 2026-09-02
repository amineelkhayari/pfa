import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, Loader2, Mic, RotateCcw, Send, Square, Wrench } from 'lucide-react';
import { aiTestApi, storesApi, type StoreProduct } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { PlanUpgradeNotice, usePlanLimit } from '../components/PlanLimitGate';
import './AiTestChat.css';

type ToolContext = { tool: string; input: Record<string, unknown>; result: Record<string, unknown> };
type ChatTurn = { role: 'customer' | 'assistant'; text: string; toolCalls?: ToolContext[]; audioUrl?: string };

function stock(product: StoreProduct): number | null {
  const values = (product.variants ?? []).map(item => Number(item.inventory_quantity ?? item.inventoryQuantity)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function AiTestChat() {
  const aiLimit = usePlanLimit('aiTokens');
  const stores = useQuery({ queryKey: ['stores'], queryFn: storesApi.listAll });
  const [storeId, setStoreId] = useState('');
  const products = useQuery({ queryKey: ['stores', storeId, 'products'], queryFn: () => storesApi.products(storeId), enabled: !!storeId });
  const welcome: ChatTurn = { role: 'assistant', text: 'Salam ! Comment puis-je vous aider aujourd’hui ?' };
  const [turns, setTurns] = useState<ChatTurn[]>([welcome]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [provider, setProvider] = useState('Configured provider');
  const [model, setModel] = useState('Select a store and start chatting');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlsRef = useRef<string[]>([]);
  useEffect(() => { if (!storeId && stores.data?.[0]) setStoreId(stores.data[0].id); }, [storeId, stores.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, sending]);
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);
  const reset = () => { audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url)); audioUrlsRef.current = []; setTurns([welcome]); setError(''); };

  const sendText = async (text: string, replyWithAudio = false) => {
    if (!text || sending) return;
    const history = turns.map(({ role, text: value }) => ({ role, text: value }));
    setMessage(''); setError(''); setSending(true); setTurns(current => [...current, { role: 'customer', text }]);
    try {
      const result = await aiTestApi.chat(text, history, storeId || undefined);
      setProvider(result.provider); setModel(result.model);
      let audioUrl: string | undefined;
      if (replyWithAudio) {
        try {
          const audio = await aiTestApi.speech(result.reply);
          audioUrl = URL.createObjectURL(audio);
          audioUrlsRef.current.push(audioUrl);
        } catch (reason) {
          setError(`La réponse texte a réussi, mais l'audio a échoué : ${reason instanceof Error ? reason.message : 'speech generation failed'}`);
        }
      }
      setTurns(current => [...current, { role: 'assistant', text: result.reply, toolCalls: result.toolCalls, audioUrl }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI provider request failed.'); }
    finally { setSending(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    await sendText(message.trim());
  };

  const processAudio = async (file?: File) => {
    if (!file || sending || transcribing) return;
    setError(''); setTranscribing(true);
    try {
      const result = await aiTestApi.transcribe(file);
      await sendText(result.text, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Audio transcription failed.');
    } finally {
      setTranscribing(false);
    }
  };

  const sendAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    await processAudio(file);
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported by this browser.');
      return;
    }
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setError('Microphone recording failed.');
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        if (blob.size) void processAudio(new File([blob], `microphone-${Date.now()}.webm`, { type }));
      };
      recorder.start(250);
      setRecording(true);
    } catch (reason) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setRecording(false);
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Unable to access the microphone.');
    }
  };

  const currency = stores.data?.find(item => item.id === storeId)?.currency || 'MAD';
  return <div className="ai-test-page"><PageHeader title="Test AI agent" subtitle="Test a realistic store conversation without sending WhatsApp messages or changing a real order"/>{aiLimit.reason && <PlanUpgradeNotice reason={aiLimit.reason}/>}<div className="agent-demo">
    <aside className="agent-catalog"><h2>Catalogue importé</h2><p>{products.data?.length ?? 0} produits depuis la boutique sélectionnée</p><div className="agent-product-list">
      {products.isLoading && <span className="agent-muted">Chargement du catalogue…</span>}
      {products.data?.map(product => { const quantity = stock(product); return <article className="agent-product" key={product.id}><strong>{product.title}</strong><small>{product.productType || 'produit'} · {Number(product.price).toFixed(2)} {currency}</small><span className={quantity === 0 ? 'out' : quantity !== null && quantity <= 5 ? 'low' : 'ok'}>{quantity === null ? 'Stock non communiqué' : quantity === 0 ? 'Rupture' : `${quantity} en stock`}</span></article>; })}
      {!products.isLoading && !products.data?.length && <span className="agent-muted">Aucun produit importé.</span>}
    </div></aside>
    <main className="agent-main">
      <div className="agent-config"><label>Boutique</label><select value={storeId} onChange={event => { setStoreId(event.target.value); reset(); }}><option value="">Choisir une boutique</option>{stores.data?.map(store => <option value={store.id} key={store.id}>{store.name} · {store.provider}</option>)}</select><label>Provider</label><span className="agent-chip">{provider}</span><label>Model</label><span className="agent-chip">{model}</span><button className="agent-reset" onClick={reset}><RotateCcw size={15}/> Nouveau test</button></div>
      <header className="agent-header"><h1><span/> Assistant Boutique</h1><p>Test sécurisé avec le catalogue réel. Aucun message WhatsApp et aucune commande réelle ne sont créés.</p></header>
      <section className="agent-messages">{turns.map((turn, index) => <div className="agent-turn-wrap" key={index}>{turn.toolCalls?.map((call, toolIndex) => <div className="agent-tool" key={`${index}-${toolIndex}`}><strong><Wrench size={14}/> Tool appelé : {call.tool}</strong><small>input →</small><pre>{JSON.stringify(call.input, null, 2)}</pre><small>résultat →</small><pre>{JSON.stringify(call.result, null, 2)}</pre></div>)}<div className={`agent-message ${turn.role}`}>{turn.text}{turn.audioUrl && <audio className="agent-reply-audio" controls preload="metadata" src={turn.audioUrl}>Votre navigateur ne prend pas en charge la lecture audio.</audio>}</div></div>)}{transcribing && <div className="agent-typing"><Loader2 className="animate-spin" size={16}/> Transcription de l’audio…</div>}{sending && <div className="agent-typing"><Loader2 className="animate-spin" size={16}/> L’assistant prépare la réponse…</div>}<div ref={endRef}/></section>
      {error && <div className="agent-error">Erreur : {error}</div>}
      <form className="agent-input" onSubmit={send}><input ref={audioRef} className="agent-audio-input" type="file" accept="audio/*,.ogg,.opus,.m4a,.webm" onChange={sendAudio}/><button type="button" className="agent-audio-button" title="Importer un fichier audio" aria-label="Importer un fichier audio" onClick={() => audioRef.current?.click()} disabled={aiLimit.blocked || sending || transcribing || recording || !storeId}>{transcribing ? <Loader2 className="animate-spin" size={18}/> : <AudioLines size={18}/>}</button><button type="button" className={`agent-audio-button agent-mic-button ${recording ? 'recording' : ''}`} title={recording ? 'Arrêter et envoyer' : 'Enregistrer avec le microphone'} aria-label={recording ? 'Arrêter et envoyer' : 'Enregistrer avec le microphone'} onClick={toggleRecording} disabled={aiLimit.blocked || sending || transcribing || !storeId}>{recording ? <Square size={16}/> : <Mic size={18}/>}</button><input value={message} maxLength={1000} disabled={aiLimit.blocked || transcribing || recording} onChange={event => setMessage(event.target.value)} placeholder={recording ? 'Enregistrement en cours… cliquez sur Stop pour envoyer' : aiLimit.reason ?? 'Écrivez, importez un audio ou utilisez le microphone…'}/><button disabled={aiLimit.blocked || !message.trim() || sending || transcribing || recording || !storeId}><Send size={17}/> Envoyer</button></form>
    </main>
  </div></div>;
}
