import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ContactRound, MessageSquare, RefreshCw, Search, ShieldOff, Smartphone, Users } from 'lucide-react';
import { contactApi } from '../services/api';
import { useSessionsQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Contacts.css';

const contactName = (contact: { name?: string; pushName?: string; number?: string; id: string }) =>
  contact.name || contact.pushName || contact.number || contact.id.split('@')[0];

export function Contacts() {
  useDocumentTitle('Contacts');
  const navigate = useNavigate();
  const { data: allSessions = [], isLoading: sessionsLoading } = useSessionsQuery();
  const readySessions = allSessions.filter(item => item.status === 'ready');
  const [selectedSession, setSelectedSession] = useState('');
  const [search, setSearch] = useState('');
  const sessionId = selectedSession || readySessions[0]?.id || '';
  const contactsQuery = useQuery({
    queryKey: ['contacts', sessionId],
    queryFn: () => contactApi.list(sessionId),
    enabled: Boolean(sessionId),
    staleTime: 60_000,
  });
  const contacts = useMemo(
    () =>
      (contactsQuery.data ?? []).filter(contact => !contact.id.endsWith('@g.us') && !contact.id.includes('broadcast')),
    [contactsQuery.data],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(contact =>
      `${contactName(contact)} ${contact.number ?? ''} ${contact.id}`.toLowerCase().includes(needle),
    );
  }, [contacts, search]);
  const saved = contacts.filter(contact => contact.isMyContact).length;
  const blocked = contacts.filter(contact => contact.isBlocked).length;
  const sendTo = (number: string) =>
    navigate(`/message-tester?sessionId=${encodeURIComponent(sessionId)}&recipient=${encodeURIComponent(number)}`);

  return (
    <div className="contacts-page">
      <PageHeader
        title="Contacts"
        subtitle="Browse WhatsApp contacts from each connected session and start a message quickly."
        actions={
          <button
            className="contacts-refresh"
            onClick={() => void contactsQuery.refetch()}
            disabled={!sessionId || contactsQuery.isFetching}
          >
            <RefreshCw size={17} className={contactsQuery.isFetching ? 'spin' : ''} /> Refresh
          </button>
        }
      />
      <section className="contacts-toolbar">
        <label>
          <span>WhatsApp session</span>
          <select
            value={sessionId}
            onChange={event => {
              setSelectedSession(event.target.value);
              setSearch('');
            }}
            disabled={sessionsLoading || !readySessions.length}
          >
            {!readySessions.length && <option value="">No connected sessions</option>}
            {readySessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.displayName || session.pushName || session.name}
                {session.phone ? ` · ${session.phone}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="contacts-search">
          <span>Search contacts</span>
          <div>
            <Search size={17} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Name or phone number…"
            />
          </div>
        </label>
      </section>
      <section className="contacts-stats">
        <article>
          <span>
            <Users />
          </span>
          <div>
            <small>Total contacts</small>
            <strong>{contacts.length}</strong>
          </div>
        </article>
        <article>
          <span>
            <ContactRound />
          </span>
          <div>
            <small>Saved contacts</small>
            <strong>{saved}</strong>
          </div>
        </article>
        <article>
          <span>
            <ShieldOff />
          </span>
          <div>
            <small>Blocked</small>
            <strong>{blocked}</strong>
          </div>
        </article>
        <article>
          <span>
            <Smartphone />
          </span>
          <div>
            <small>Connected devices</small>
            <strong>{readySessions.length}</strong>
          </div>
        </article>
      </section>
      <section className="contacts-card">
        <div className="contacts-card-head">
          <div>
            <h2>WhatsApp contacts</h2>
            <p>
              {filtered.length} contact{filtered.length === 1 ? '' : 's'} shown
            </p>
          </div>
        </div>
        {contactsQuery.isLoading ? (
          <div className="contacts-empty">
            <RefreshCw className="spin" />
            <b>Loading contacts…</b>
          </div>
        ) : contactsQuery.isError ? (
          <div className="contacts-empty error">
            <ShieldOff />
            <b>Unable to load contacts</b>
            <span>{(contactsQuery.error as Error).message}</span>
          </div>
        ) : !sessionId ? (
          <div className="contacts-empty">
            <Smartphone />
            <b>Connect a WhatsApp session first</b>
            <span>Contacts are read from a live WhatsApp device.</span>
          </div>
        ) : !filtered.length ? (
          <div className="contacts-empty">
            <ContactRound />
            <b>No contacts found</b>
            <span>Try another search or refresh the connected session.</span>
          </div>
        ) : (
          <div className="contacts-list">
            {filtered.map(contact => {
              const number = contact.number || contact.id.split('@')[0];
              const name = contactName(contact);
              return (
                <article key={contact.id} className="contact-row">
                  <div className="contact-avatar">{name.slice(0, 2).toUpperCase()}</div>
                  <div className="contact-identity">
                    <b>{name}</b>
                    <span>+{number.replace(/^\+/, '')}</span>
                  </div>
                  <div className="contact-flags">
                    {contact.isMyContact && <span>Saved</span>}
                    {contact.isBlocked && <span className="blocked">Blocked</span>}
                  </div>
                  <button onClick={() => sendTo(number)}>
                    <MessageSquare size={16} /> Send message
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
