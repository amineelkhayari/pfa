import { useEffect, useRef, useState, useMemo, type ChangeEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AudioLines,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Square,
  Wrench,
  Bot,
  User,
  ShoppingBag,
  Search,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Volume2,
  Store as StoreIcon,
  Languages,
  AlertCircle,
} from 'lucide-react';
import { aiTestApi, storesApi, type StoreProduct } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { PlanUpgradeNotice, usePlanLimit } from '../components/PlanLimitGate';
import './AiTestChat.css';

type ToolContext = {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

type ChatTurn = {
  role: 'customer' | 'assistant';
  text: string;
  toolCalls?: ToolContext[];
  audioUrl?: string;
  timestamp?: string;
};

function stock(product: StoreProduct): { label: string; type: 'ok' | 'low' | 'out' } {
  const pAny = product as unknown as Record<string, unknown>;

  // Check direct quantity fields on product level
  const directFields = [
    pAny.stock,
    pAny.quantity,
    pAny.stockQuantity,
    pAny.inventoryQuantity,
    pAny.stock_quantity,
    pAny.inventory_quantity,
  ];
  const direct = directFields.map(Number).find(n => Number.isFinite(n) && n !== null);

  let totalQty: number | null = null;
  if (direct !== undefined) {
    totalQty = direct;
  } else if (Array.isArray(product.variants) && product.variants.length > 0) {
    const variantQuantities = product.variants
      .map(item => {
        const v = item as Record<string, unknown>;
        const q = [
          v.inventory_quantity,
          v.inventoryQuantity,
          v.stock_quantity,
          v.stockQuantity,
          v.quantity,
          v.stock,
        ]
          .map(Number)
          .find(n => Number.isFinite(n) && n !== null);
        return q;
      })
      .filter((q): q is number => q !== undefined);

    if (variantQuantities.length > 0) {
      totalQty = variantQuantities.reduce((a, b) => a + b, 0);
    }
  }

  if (totalQty !== null) {
    if (totalQty === 0) return { label: 'Rupture', type: 'out' };
    if (totalQty <= 5) return { label: `${totalQty} restant${totalQty > 1 ? 's' : ''}`, type: 'low' };
    return { label: `${totalQty} en stock`, type: 'ok' };
  }

  // Fallback for stores that do not manage stock quantity per item
  const statusStr = String(product.status || '').toLowerCase();
  if (statusStr === 'active' || statusStr === 'publish' || statusStr === 'instock') {
    return { label: 'En stock', type: 'ok' };
  }
  return { label: 'Disponible', type: 'ok' };
}

const SUGGESTED_PROMPTS = [
  'Quels sont vos produits disponibles en stock ?',
  'Je souhaite vérifier le statut de ma commande.',
  'Quel est le délai de livraison pour Casablanca ?',
  'Est-ce que le paiement se fait à la livraison ?',
];

export function AiTestChat() {
  const aiLimit = usePlanLimit('aiTokens');
  const stores = useQuery({ queryKey: ['stores'], queryFn: storesApi.listAll });
  const [storeId, setStoreId] = useState('');
  const products = useQuery({
    queryKey: ['stores', storeId, 'products'],
    queryFn: () => storesApi.products(storeId),
    enabled: !!storeId,
  });

  const [catalogSearch, setCatalogSearch] = useState('');
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const welcome: ChatTurn = {
    role: 'assistant',
    text: 'Salam ! Je suis votre assistant virtuel SmartConfirm. Comment puis-je vous aider aujourd’hui ?',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [turns, setTurns] = useState<ChatTurn[]>([welcome]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('ar-MA');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [provider, setProvider] = useState('Assistant IA');
  const [model, setModel] = useState('Sélectionnez une boutique pour tester');
  const [error, setError] = useState('');

  const endRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlsRef = useRef<string[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!storeId && stores.data?.[0]) setStoreId(stores.data[0].id);
  }, [storeId, stores.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, sending, transcribing]);

  // Recording Timer
  useEffect(() => {
    if (recording) {
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const reset = () => {
    audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    audioUrlsRef.current = [];
    setTurns([welcome]);
    setError('');
    setExpandedTools({});
  };

  const copyCode = (content: string, key: string) => {
    navigator.clipboard.writeText(content);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleToolExpand = (key: string) => {
    setExpandedTools(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sendText = async (text: string, replyWithAudio = false) => {
    if (!text || sending) return;
    const history = turns.map(({ role, text: value }) => ({ role, text: value }));
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessage('');
    setError('');
    setSending(true);
    setTurns(current => [...current, { role: 'customer', text, timestamp: nowTime }]);

    try {
      const result = await aiTestApi.chat(text, history, storeId || undefined);
      setProvider(result.provider);
      setModel(result.model);

      let audioUrl: string | undefined;
      if (replyWithAudio) {
        try {
          const audio = await aiTestApi.speech(result.reply);
          audioUrl = URL.createObjectURL(audio);
          audioUrlsRef.current.push(audioUrl);
        } catch (reason) {
          setError(
            `La réponse texte a réussi, mais l'audio a échoué : ${
              reason instanceof Error ? reason.message : 'speech generation failed'
            }`
          );
        }
      }

      setTurns(current => [
        ...current,
        {
          role: 'assistant',
          text: result.reply,
          toolCalls: result.toolCalls,
          audioUrl,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI provider request failed.');
    } finally {
      setSending(false);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    await sendText(message.trim());
  };

  const processAudio = async (file?: File) => {
    if (!file || sending || transcribing) return;
    setError('');
    setTranscribing(true);
    try {
      const result = await aiTestApi.transcribe(file, transcriptionLanguage);
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
      const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError('Microphone recording failed.');
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        if (blob.size)
          void processAudio(new File([blob], `microphone-${Date.now()}.webm`, { type }));
      };
      recorder.start(250);
      setRecording(true);
    } catch (reason) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setRecording(false);
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Unable to access the microphone.'
      );
    }
  };

  const selectedStore = stores.data?.find(item => item.id === storeId);
  const currency = selectedStore?.currency || 'MAD';

  const filteredProducts = useMemo(() => {
    if (!products.data) return [];
    if (!catalogSearch.trim()) return products.data;
    const term = catalogSearch.toLowerCase().trim();
    return products.data.filter(p => p.title.toLowerCase().includes(term));
  }, [products.data, catalogSearch]);

  const askAboutProduct = (productTitle: string) => {
    setMessage(`Pouvez-vous me donner des détails sur le produit "${productTitle}" ?`);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="ai-test-page">
      <PageHeader
        title="Test de l'Agent IA & Voix"
        subtitle="Simulez une conversation réaliste en Darija ou Français avec votre catalogue e-commerce sans impacter de vraie commande"
      />

      {aiLimit.reason && <PlanUpgradeNotice reason={aiLimit.reason} />}

      <div className="agent-workspace-card" data-tour="ai-test-workspace">
        {/* Left Column: Store Catalog Sidebar */}
        <aside className="agent-catalog-sidebar">
          <div className="catalog-sidebar-header">
            <div className="catalog-title-wrap">
              <ShoppingBag size={17} className="catalog-header-icon" />
              <h3>Catalogue Boutique</h3>
            </div>
            <span className="catalog-badge">
              {products.data?.length ?? 0} produits
            </span>
          </div>

          <div className="catalog-search-wrap">
            <Search size={14} className="catalog-search-icon" />
            <input
              type="text"
              placeholder="Filtrer un produit…"
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
            />
            {catalogSearch && (
              <button className="clear-cat-btn" onClick={() => setCatalogSearch('')}>
                ×
              </button>
            )}
          </div>

          <div className="agent-product-list">
            {products.isLoading ? (
              <div className="catalog-loading">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span>Chargement du catalogue…</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="catalog-empty">
                <p>
                  {catalogSearch
                    ? 'Aucun produit ne correspond à ce filtre.'
                    : 'Aucun produit synchronisé pour cette boutique.'}
                </p>
              </div>
            ) : (
              filteredProducts.map(product => {
                const stockInfo = stock(product);
                return (
                  <article
                    className="agent-product-card"
                    key={product.id}
                    onClick={() => askAboutProduct(product.title)}
                    title="Cliquez pour poser une question sur ce produit"
                  >
                    <div className="prod-card-top">
                      <strong className="prod-title">{product.title}</strong>
                      <span className={`stock-pill ${stockInfo.type}`}>
                        {stockInfo.label}
                      </span>
                    </div>

                    <div className="prod-card-bottom">
                      <span className="prod-price">
                        {Number(product.price).toFixed(2)} {currency}
                      </span>
                      <span className="ask-hint">Demander à l'IA ↵</span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Column: Chat Console */}
        <main className="agent-chat-main">
          {/* Top Config Controls */}
          <div className="agent-top-config">
            <div className="config-item store-select">
              <label>
                <StoreIcon size={14} />
                <span>Boutique</span>
              </label>
              <select
                value={storeId}
                onChange={event => {
                  setStoreId(event.target.value);
                  reset();
                }}
              >
                <option value="">Sélectionner une boutique</option>
                {stores.data?.map(store => (
                  <option value={store.id} key={store.id}>
                    {store.name} ({store.provider})
                  </option>
                ))}
              </select>
            </div>

            <div className="config-item lang-select">
              <label>
                <Languages size={14} />
                <span>Langue Audio</span>
              </label>
              <select
                value={transcriptionLanguage}
                onChange={event => setTranscriptionLanguage(event.target.value)}
              >
                <option value="ar-MA">Darija Marocaine (ar-MA)</option>
                <option value="fr">Français (fr)</option>
                <option value="multi">Multilingue (Auto)</option>
              </select>
            </div>

            <div className="model-status-pill" title={`Modèle: ${model}`}>
              <span className="pulse-dot" />
              <div className="model-text">
                <span className="prov-name">{provider}</span>
                <span className="model-name">{model}</span>
              </div>
            </div>

            <button className="agent-reset-btn" onClick={reset} title="Réinitialiser la discussion">
              <RotateCcw size={15} />
              <span>Nouveau test</span>
            </button>
          </div>

          {/* Chat Messages Viewport */}
          <section className="agent-messages-container">
            {turns.length === 1 && (
              <div className="welcome-banner">
                <div className="welcome-icon-wrap">
                  <Bot size={28} />
                </div>
                <h3>Simulateur de Conversation Client</h3>
                <p>
                  Testez les réponses du bot, la validation des commandes en Darija ou Français,
                  et l'exécution automatique des outils (stocks, adresses, confirmations).
                </p>

                <div className="suggestions-grid">
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      className="suggestion-chip"
                      onClick={() => sendText(prompt)}
                      disabled={sending || transcribing}
                    >
                      <Sparkles size={13} className="spark-icon" />
                      <span>{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, index) => (
              <div className="turn-block" key={index}>
                {/* Tool Calls Display */}
                {turn.toolCalls?.map((call, toolIndex) => {
                  const toolKey = `${index}-${toolIndex}`;
                  const isExpanded = expandedTools[toolKey] ?? false;
                  return (
                    <div className="tool-call-card" key={toolKey}>
                      <div
                        className="tool-card-header"
                        onClick={() => toggleToolExpand(toolKey)}
                      >
                        <div className="tool-title-wrap">
                          <Wrench size={14} className="tool-icon" />
                          <span className="tool-name">
                            Outil exécuté : <code>{call.tool}</code>
                          </span>
                        </div>
                        <div className="tool-actions-right">
                          <button
                            className="tool-copy-btn"
                            onClick={e => {
                              e.stopPropagation();
                              copyCode(
                                JSON.stringify({ input: call.input, result: call.result }, null, 2),
                                toolKey
                              );
                            }}
                            title="Copier les données JSON"
                          >
                            {copiedKey === toolKey ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="tool-card-body">
                          <div className="tool-param-block">
                            <span className="param-label">Paramètres d'entrée :</span>
                            <pre>{JSON.stringify(call.input, null, 2)}</pre>
                          </div>
                          <div className="tool-param-block">
                            <span className="param-label">Résultat renvoyé :</span>
                            <pre>{JSON.stringify(call.result, null, 2)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Message Bubble */}
                <div className={`message-row ${turn.role}`}>
                  <div className="avatar-bubble">
                    {turn.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}
                  </div>

                  <div className={`message-bubble ${turn.role}`}>
                    <div className="message-content">{turn.text}</div>

                    {/* Audio Response Note */}
                    {turn.audioUrl && (
                      <div className="voice-note-player">
                        <div className="vn-header">
                          <Volume2 size={15} className="vn-icon" />
                          <span>Réponse Vocale Synthétisée (TTS)</span>
                        </div>
                        <audio controls preload="metadata" src={turn.audioUrl}>
                          Votre navigateur ne prend pas en charge la lecture audio.
                        </audio>
                      </div>
                    )}

                    {turn.timestamp && (
                      <span className="message-time">{turn.timestamp}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* In-Flight States */}
            {transcribing && (
              <div className="typing-state transcribing">
                <Loader2 size={16} className="animate-spin text-primary" />
                <AudioLines size={16} className="audio-wave-anim" />
                <span>Transcription Whisper en cours (analyse Darija / voix)…</span>
              </div>
            )}

            {sending && (
              <div className="typing-state">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span>SmartConfirm formule la réponse…</span>
              </div>
            )}

            <div ref={endRef} />
          </section>

          {/* Error Banner */}
          {error && (
            <div className="chat-error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button className="dismiss-err-btn" onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}

          {/* Bottom Chat Input Form */}
          <form className="agent-input-footer" onSubmit={send}>
            <input
              ref={audioRef}
              type="file"
              className="hidden-file-input"
              accept="audio/*,.ogg,.opus,.m4a,.webm,.mp3"
              onChange={sendAudio}
            />

            {/* Audio Upload File Button */}
            <button
              type="button"
              className="action-icon-btn"
              title="Importer une note vocale existante (.ogg, .opus, .mp3)"
              onClick={() => audioRef.current?.click()}
              disabled={aiLimit.blocked || sending || transcribing || recording || !storeId}
            >
              {transcribing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <AudioLines size={18} />
              )}
            </button>

            {/* Microphone Record Button */}
            <button
              type="button"
              className={`action-icon-btn mic-btn ${recording ? 'recording' : ''}`}
              title={recording ? 'Arrêter et envoyer' : 'Enregistrer une note vocale en direct'}
              onClick={toggleRecording}
              disabled={aiLimit.blocked || sending || transcribing || !storeId}
            >
              {recording ? <Square size={16} /> : <Mic size={18} />}
            </button>

            {/* Active Recording Wave Banner or Text Input */}
            {recording ? (
              <div className="recording-live-indicator">
                <span className="rec-pulse-bullet" />
                <span className="rec-text">Enregistrement audio en cours…</span>
                <span className="rec-timer">{formatSeconds(recordingSeconds)}</span>
                <span className="rec-hint">Cliquez sur Carré pour transcrire</span>
              </div>
            ) : (
              <input
                type="text"
                className="chat-text-input"
                value={message}
                maxLength={1000}
                disabled={aiLimit.blocked || transcribing || recording}
                onChange={event => setMessage(event.target.value)}
                placeholder={
                  aiLimit.reason ??
                  (!storeId
                    ? 'Sélectionnez une boutique ci-dessus pour commencer…'
                    : 'Écrivez un message en Darija ou Français, ou utilisez le microphone…')
                }
              />
            )}

            {/* Send Button */}
            <button
              type="submit"
              className="chat-send-btn"
              disabled={
                aiLimit.blocked ||
                !message.trim() ||
                sending ||
                transcribing ||
                recording ||
                !storeId
              }
            >
              <Send size={16} />
              <span>Envoyer</span>
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
