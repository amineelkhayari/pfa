import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RotateCcw, Send, Wrench } from 'lucide-react';
import { aiTestApi, storesApi, type StoreProduct } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { PlanUpgradeNotice, usePlanLimit } from '../components/PlanLimitGate';
import './AiTestChat.css';

type ToolContext = { tool: string; input: Record<string, unknown>; result: Record<string, unknown> };
type ChatTurn = { role: 'customer' | 'assistant'; text: string; toolCalls?: ToolContext[] };

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
  const [provider, setProvider] = useState('Configured provider');
  const [model, setModel] = useState('Select a store and start chatting');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!storeId && stores.data?.[0]) setStoreId(stores.data[0].id); }, [storeId, stores.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, sending]);
  const reset = () => { setTurns([welcome]); setError(''); };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    const history = turns.map(({ role, text: value }) => ({ role, text: value }));
    setMessage(''); setError(''); setSending(true); setTurns(current => [...current, { role: 'customer', text }]);
    try {
      const result = await aiTestApi.chat(text, history, storeId || undefined);
      setProvider(result.provider); setModel(result.model);
      setTurns(current => [...current, { role: 'assistant', text: result.reply, toolCalls: result.toolCalls }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI provider request failed.'); }
    finally { setSending(false); }
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
      <section className="agent-messages">{turns.map((turn, index) => <div className="agent-turn-wrap" key={index}>{turn.toolCalls?.map((call, toolIndex) => <div className="agent-tool" key={`${index}-${toolIndex}`}><strong><Wrench size={14}/> Tool appelé : {call.tool}</strong><small>input →</small><pre>{JSON.stringify(call.input, null, 2)}</pre><small>résultat →</small><pre>{JSON.stringify(call.result, null, 2)}</pre></div>)}<div className={`agent-message ${turn.role}`}>{turn.text}</div></div>)}{sending && <div className="agent-typing"><Loader2 className="animate-spin" size={16}/> L’assistant réfléchit…</div>}<div ref={endRef}/></section>
      {error && <div className="agent-error">Erreur : {error}</div>}
      <form className="agent-input" onSubmit={send}><input value={message} maxLength={1000} disabled={aiLimit.blocked} onChange={event => setMessage(event.target.value)} placeholder={aiLimit.reason ?? 'Ex: quels produits avez-vous ? / je cherche un produit à moins de 500 MAD'}/><button disabled={aiLimit.blocked || !message.trim() || sending || !storeId}><Send size={17}/> Envoyer</button></form>
    </main>
  </div></div>;
}
