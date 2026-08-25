import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContactRound, Loader2, Search } from 'lucide-react';
import { Modal } from '../Modal';
import { contactApi, type Chat, type Contact } from '../../services/api';
import { useTranslation } from 'react-i18next';

interface NewChatModalProps {
  open: boolean;
  sessionId: string;
  onClose: () => void;
  onSelect: (chat: Chat) => void;
}

const displayName = (contact: Contact) =>
  contact.name || contact.pushName || contact.number || contact.id.split('@')[0];

export default function NewChatModal({ open, sessionId, onClose, onSelect }: NewChatModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['contacts', sessionId],
    queryFn: () => contactApi.list(sessionId),
    enabled: open && Boolean(sessionId),
    staleTime: 60_000,
  });
  const contacts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data ?? [])
      .filter(contact => !contact.id.endsWith('@g.us') && !contact.id.includes('broadcast'))
      .filter(
        contact =>
          !needle || `${displayName(contact)} ${contact.number ?? ''} ${contact.id}`.toLowerCase().includes(needle),
      );
  }, [query.data, search]);
  const select = (contact: Contact) => {
    onSelect({
      id: contact.id,
      name: displayName(contact),
      isGroup: false,
      kind: 'individual',
      unreadCount: 0,
      timestamp: 0,
    });
    setSearch('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('chats.newChat')} className="new-chat-modal">
      <div className="new-chat-search">
        <Search size={18} />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={t('chats.newChatSearch')}
          autoFocus
        />
      </div>
      <div className="new-chat-contacts">
        {query.isLoading ? (
          <div className="new-chat-empty">
            <Loader2 className="animate-spin" />
            <span>Loading contacts…</span>
          </div>
        ) : query.isError ? (
          <div className="new-chat-empty">
            <ContactRound />
            <b>Unable to load contacts</b>
            <span>{(query.error as Error).message}</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="new-chat-empty">
            <ContactRound />
            <b>{t('chats.newChatEmpty')}</b>
            <span>{t('chats.newChatEmptyHint')}</span>
          </div>
        ) : (
          contacts.map(contact => {
            const name = displayName(contact);
            const number = contact.number || contact.id.split('@')[0];
            return (
              <button type="button" className="new-chat-contact" key={contact.id} onClick={() => select(contact)}>
                <span className="new-chat-avatar">{name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <b>{name}</b>
                  <small>+{number.replace(/^\+/, '')}</small>
                </span>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
