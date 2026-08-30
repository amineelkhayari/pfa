import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, Paperclip, Send, Smile, X } from 'lucide-react';
import { contactApi, messageApi, type Chat, type MessageType } from '../../services/api';
import { mergeOrAppend, type ChatMessageView } from '../../utils/chatMessages';
import { promoteChatWithSnippet } from '../../utils/chatList';
import { messagesQueryKey, useChatMessagesActions } from '../../hooks/useChatMessages';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import type { ScrollDirection } from '../../utils/scrollDecision';
import { PlanUpgradeNotice, usePlanLimit } from '../PlanLimitGate';

// Map an attachment MIME type to the neutral MessageType for the optimistic outgoing bubble, so the
// placeholder matches what the backend will persist (e.g. a PDF is `document`, not `application`).
const messageTypeFromMime = (mimetype: string): MessageType => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
};

type ComposerType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'location'
  | 'contact'
  | 'sticker'
  | 'poll'
  | 'buttons'
  | 'orderConfirmation'
  | 'forward';
const composerTypes: ComposerType[] = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'location',
  'contact',
  'sticker',
  'poll',
  'buttons',
  'orderConfirmation',
  'forward',
];
const fileComposerTypes: ComposerType[] = ['image', 'video', 'audio', 'document', 'sticker'];
const mediaAccept: Partial<Record<ComposerType, string>> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: '*/*',
  sticker: 'image/webp,image/png,image/jpeg',
};

/** A picked-but-unsent file, staged until send, removal, or a move to another chat. */
export interface StagedAttachment {
  file: File;
  base64: string;
  mimetype: string;
  filename: string;
}

interface ChatComposerProps {
  selectedSessionId: string;
  activeChat: Chat;
  replyingTo: ChatMessageView | null;
  setReplyingTo: Dispatch<SetStateAction<ChatMessageView | null>>;
  onMessageAppended: (direction: ScrollDirection) => void;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  attachment: StagedAttachment | null;
  setAttachment: Dispatch<SetStateAction<StagedAttachment | null>>;
  previewUrl: string | null;
  setPreviewUrl: Dispatch<SetStateAction<string | null>>;
  automationLocked?: boolean;
}

// The composer half of the chat room: attachment preview, emoji panel, reply banner, and the input
// bar with the whole optimistic-send flow. `replyingTo` is shared with the thread (its reply action
// sets it), and `messageInput` plus the staged attachment live in the page so a draft survives
// closing the room; everything else is local.
function ChatComposer({
  selectedSessionId,
  activeChat,
  replyingTo,
  setReplyingTo,
  onMessageAppended,
  setChats,
  messageInput,
  setMessageInput,
  attachment,
  setAttachment,
  previewUrl,
  setPreviewUrl,
  automationLocked = false,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const { canWrite } = useRole();
  const { error: showErrorToast } = useToast();
  const { appendMessage, updateMessage } = useChatMessagesActions();
  const queryClient = useQueryClient();
  const messageLimit = usePlanLimit('sentMessages');
  const canCompose = canWrite && !automationLocked && !messageLimit.blocked;

  const [sending, setSending] = useState<boolean>(false);
  const [composerType, setComposerType] = useState<ComposerType>('text');
  const [showTypes, setShowTypes] = useState(false);
  const [specialValues, setSpecialValues] = useState<string[]>(['', '', '']);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const typeLabel = (type: ComposerType) =>
    type === 'buttons' || type === 'orderConfirmation'
      ? t(`chats.messageTypes.${type}`)
      : t(`messageTester.types.${type}`);

  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  // Monotonic token invalidating an in-flight attachment FileReader: picking a second file (or
  // removing the attachment) before `onload` fires must win over the late-arriving bytes —
  // otherwise the slower read overwrites the newer pick. Same pattern as composeImageReadSeq.
  const attachmentReadSeq = useRef(0);

  // Leaving this conversation — switching to another chat, or unmounting when the room closes —
  // invalidates an in-flight read, so its late `onload` drops the bytes instead of staging them
  // against whichever chat is open by then. The attachment state itself lives in the page.
  useEffect(() => {
    return () => {
      attachmentReadSeq.current += 1;
    };
  }, [activeChat.id]);

  // References
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Popular emojis
  const popularEmojis = [
    '😀',
    '😂',
    '👍',
    '❤️',
    '🔥',
    '👏',
    '🙏',
    '🎉',
    '💡',
    '🤔',
    '😅',
    '😍',
    '😊',
    '😭',
    '😎',
    '😜',
    '🚀',
    '✨',
  ];

  // 5. Handle file selection & base64 conversion
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    const myRead = ++attachmentReadSeq.current;
    const reader = new FileReader();
    reader.onload = event => {
      // A newer pick, a removal, or an unmount since the read started supersedes these bytes.
      if (attachmentReadSeq.current !== myRead) return;
      const dataUrl = event.target?.result as string;
      const base64Data = dataUrl.split(',')[1];
      setAttachment({ file, base64: base64Data, mimetype: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    attachmentReadSeq.current += 1; // an in-flight read must not resurrect the removed attachment
    setAttachment(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const selectComposerType = (type: ComposerType) => {
    setComposerType(type);
    setShowTypes(false);
    setSpecialValues(['', '', '']);
    setPollOptions(['', '']);
    handleRemoveAttachment();
    if (fileComposerTypes.includes(type)) setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleEmojiClick = (emoji: string) => {
    setMessageInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const canSendSpecial =
    (composerType === 'location' && specialValues[0] !== '' && specialValues[1] !== '') ||
    (composerType === 'contact' && !!specialValues[0].trim() && !!specialValues[1].trim()) ||
    (composerType === 'poll' && !!specialValues[0].trim() && pollOptions.filter(option => option.trim()).length >= 2) ||
    (composerType === 'buttons' && !!messageInput.trim() && pollOptions.some(option => option.trim())) ||
    (composerType === 'orderConfirmation' && !!messageInput.trim()) ||
    (composerType === 'forward' && !!specialValues[0].trim() && !!specialValues[1].trim());

  // 7. Handle sending a message / media
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedSessionId || !activeChat || sending || !canCompose) return;

    const textToSend = messageInput.trim();
    const filledPollOptions = pollOptions.map(option => option.trim()).filter(Boolean);
    const specialValid =
      (composerType === 'location' &&
        specialValues[0] !== '' &&
        specialValues[1] !== '' &&
        Number.isFinite(Number(specialValues[0])) &&
        Number.isFinite(Number(specialValues[1]))) ||
      (composerType === 'contact' && !!specialValues[0].trim() && !!specialValues[1].trim()) ||
      (composerType === 'poll' && !!specialValues[0].trim() && filledPollOptions.length >= 2) ||
      (composerType === 'buttons' && !!textToSend && filledPollOptions.length >= 1) ||
      (composerType === 'orderConfirmation' && !!textToSend) ||
      (composerType === 'forward' && !!specialValues[0].trim() && !!specialValues[1].trim());
    if (fileComposerTypes.includes(composerType) && !attachment) return;
    if (!textToSend && !attachment && !specialValid) return;

    setMessageInput('');
    setSending(true);

    const tempId = `temp_${Date.now()}`;
    const tempMessage: ChatMessageView = {
      id: tempId,
      chatId: activeChat.id,
      from: 'me',
      to: activeChat.id,
      body:
        composerType === 'location'
          ? `📍 ${specialValues[0]}, ${specialValues[1]}`
          : composerType === 'contact'
            ? `👤 ${specialValues[0]}`
            : composerType === 'poll'
              ? `📊 ${specialValues[0]}`
              : composerType === 'buttons' || composerType === 'orderConfirmation'
                ? textToSend
                : composerType === 'forward'
                  ? `↪ ${specialValues[0]}`
                  : attachment
                    ? attachment.mimetype.startsWith('image/') ||
                      attachment.mimetype.startsWith('video/') ||
                      attachment.mimetype.startsWith('audio/')
                      ? textToSend
                      : attachment.filename
                    : textToSend,
      type:
        composerType === 'sticker'
          ? 'sticker'
          : attachment
            ? messageTypeFromMime(attachment.mimetype)
            : (composerType as MessageType),
      direction: 'outgoing',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: attachment
        ? {
            media: {
              mimetype: attachment.mimetype,
              filename: attachment.filename,
              data: attachment.base64,
            },
          }
        : replyingTo
          ? {
              quotedMessage: {
                id: replyingTo.waMessageId || replyingTo.id,
                body: replyingTo.type !== 'text' ? `[${replyingTo.type}]` : replyingTo.body,
              },
            }
          : undefined,
    };

    appendMessage(selectedSessionId, activeChat.id, tempMessage);
    onMessageAppended('outgoing');

    const currentAttachment = attachment;
    const currentReplyingTo = replyingTo;
    handleRemoveAttachment();
    setReplyingTo(null);

    try {
      let result;

      if (composerType === 'location') {
        result = await messageApi.sendLocation(selectedSessionId, {
          chatId: activeChat.id,
          latitude: Number(specialValues[0]),
          longitude: Number(specialValues[1]),
          ...(textToSend ? { description: textToSend } : {}),
        });
      } else if (composerType === 'contact') {
        result = await messageApi.sendContact(selectedSessionId, {
          chatId: activeChat.id,
          contactName: specialValues[0].trim(),
          contactNumber: specialValues[1].trim(),
        });
      } else if (composerType === 'poll') {
        result = await messageApi.sendPoll(selectedSessionId, {
          chatId: activeChat.id,
          name: specialValues[0].trim(),
          options: filledPollOptions,
        });
      } else if (composerType === 'buttons' || composerType === 'orderConfirmation') {
        const labels =
          composerType === 'orderConfirmation' ? [t('chats.confirm'), t('chats.cancel')] : filledPollOptions;
        result = await messageApi.sendButtons(selectedSessionId, {
          chatId: activeChat.id,
          text: textToSend,
          ...(specialValues[0].trim() ? { footer: specialValues[0].trim() } : {}),
          buttons: labels.slice(0, 3).map((label, index) => ({
            id: `${composerType}_${index + 1}`,
            label,
          })),
        });
      } else if (composerType === 'forward') {
        let toChatId = specialValues[1].trim();
        if (!toChatId.includes('@')) {
          const checked = await contactApi.checkNumber(selectedSessionId, toChatId.replace(/[^0-9]/g, ''));
          if (!checked.exists || !checked.whatsappId) throw new Error(t('messageTester.notOnWhatsApp'));
          toChatId = checked.whatsappId;
        }
        result = await messageApi.forward(selectedSessionId, {
          fromChatId: activeChat.id,
          toChatId,
          messageId: specialValues[0].trim(),
        });
      } else if (currentAttachment && composerType === 'sticker') {
        result = await messageApi.sendSticker(selectedSessionId, activeChat.id, {
          base64: currentAttachment.base64,
          mimetype: currentAttachment.mimetype,
          filename: currentAttachment.filename,
        });
      } else if (currentAttachment) {
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
        const mime = currentAttachment.mimetype;
        if (mime.startsWith('image/')) mediaType = 'image';
        else if (mime.startsWith('video/')) mediaType = 'video';
        else if (mime.startsWith('audio/')) mediaType = 'audio';

        result = await messageApi.sendMedia(selectedSessionId, activeChat.id, mediaType, {
          base64: currentAttachment.base64,
          mimetype: currentAttachment.mimetype,
          filename: currentAttachment.filename,
          caption: mediaType !== 'audio' ? textToSend : undefined,
        });
      } else if (currentReplyingTo) {
        result = await messageApi.reply(selectedSessionId, {
          chatId: activeChat.id,
          quotedMessageId: currentReplyingTo.waMessageId || currentReplyingTo.id,
          text: textToSend,
        });
      } else {
        result = await messageApi.sendText(selectedSessionId, activeChat.id, textToSend);
      }

      // Race guard: the realtime `message.sent` echo can arrive before this response and already
      // append the message by its real WA id (the dedup at receive time misses because the
      // optimistic placeholder still carries the temp id). If so, fold the placeholder INTO the
      // echo's row via mergeOrAppend instead of just dropping it — the echo carries no media
      // payload (engine parity marker), so dropping the placeholder would erase the attachment's
      // base64 and leave a bare "📎 Media" bubble until the next refetch.
      const sendKey = messagesQueryKey(selectedSessionId, activeChat.id);
      queryClient.setQueryData<ChatMessageView[]>(sendKey, (prev = []) => {
        const reconciled: ChatMessageView = {
          ...tempMessage,
          id: result.messageId,
          waMessageId: result.messageId,
          status: 'sent',
        };
        const echoAlreadyAdded = prev.some(m => m.id === result.messageId || m.waMessageId === result.messageId);
        if (echoAlreadyAdded) {
          return mergeOrAppend(
            prev.filter(m => m.id !== tempId),
            reconciled,
          );
        }
        return prev.map(m => (m.id === tempId ? reconciled : m));
      });

      // Update sidebar chat list (move active chat to the top with the new snippet)
      const snippet = currentAttachment ? `[${currentAttachment.mimetype.split('/')[0]}]` : textToSend;
      const sentAt = Math.floor(Date.now() / 1000);
      setChats(prevChats => {
        const promoted = promoteChatWithSnippet(prevChats, activeChat.id, snippet, sentAt);
        return promoted === prevChats
          ? [{ ...activeChat, lastMessage: snippet, timestamp: sentAt, unreadCount: 0 }, ...prevChats]
          : promoted;
      });
      if (composerType !== 'text') {
        setComposerType('text');
        setSpecialValues(['', '', '']);
        setPollOptions(['', '']);
      }
    } catch (err) {
      showErrorToast(t('chats.errors.send'), err instanceof Error ? err.message : undefined);
      updateMessage(selectedSessionId, activeChat.id, tempId, { status: 'failed' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {messageLimit.reason && <PlanUpgradeNotice reason={messageLimit.reason} compact />}
      {/* Attachment preview banner */}
      {attachment && (
        <div className="attachment-preview-banner">
          {previewUrl ? (
            <img src={previewUrl} alt={attachment.filename} className="preview-thumbnail" />
          ) : (
            <div className="preview-file-icon">📎</div>
          )}
          <div className="preview-file-info">
            <span className="preview-filename">{attachment.filename}</span>
            <span className="preview-filesize">({(attachment.file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <button className="btn-remove-attachment" onClick={handleRemoveAttachment}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Popular emojis panel */}
      {showEmojiPicker && (
        <div className="chats-emoji-picker">
          <div className="emoji-grid">
            {popularEmojis.map(emoji => (
              <button key={emoji} type="button" className="emoji-btn" onClick={() => handleEmojiClick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Replying preview banner */}
      {replyingTo && (
        <div className="replying-preview-banner">
          <div className="replying-preview-content">
            <div className="replying-to-title">
              {t('chats.replyingTo', {
                name:
                  replyingTo.direction === 'outgoing' ? t('chats.you') : activeChat.name || activeChat.id.split('@')[0],
              })}
            </div>
            <div className="replying-to-body">
              {replyingTo.type !== 'text' ? `[${replyingTo.type}]` : replyingTo.body}
            </div>
          </div>
          <button className="btn-close-reply" onClick={() => setReplyingTo(null)}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Message input bar */}
      <footer className="room-input-footer">
        <div className="chat-type-picker">
          <button
            type="button"
            className="chat-type-current"
            onClick={() => setShowTypes(open => !open)}
            disabled={!canCompose || sending}
          >
            <span>{t('messageTester.messageType')}</span>
            <b>{typeLabel(composerType)}</b>
            <ChevronDown size={16} />
          </button>
          {showTypes && (
            <div className="chat-type-menu">
              {composerTypes.map(type => (
                <button
                  type="button"
                  key={type}
                  className={composerType === type ? 'active' : ''}
                  onClick={() => selectComposerType(type)}
                >
                  {typeLabel(type)}
                </button>
              ))}
            </div>
          )}
        </div>

        {composerType === 'location' && (
          <div className="chat-special-fields">
            <input
              value={specialValues[0]}
              onChange={e => setSpecialValues([e.target.value, specialValues[1], ''])}
              placeholder={t('messageTester.locationLatitude')}
            />
            <input
              value={specialValues[1]}
              onChange={e => setSpecialValues([specialValues[0], e.target.value, ''])}
              placeholder={t('messageTester.locationLongitude')}
            />
          </div>
        )}
        {composerType === 'contact' && (
          <div className="chat-special-fields">
            <input
              value={specialValues[0]}
              onChange={e => setSpecialValues([e.target.value, specialValues[1], ''])}
              placeholder={t('messageTester.contactName')}
            />
            <input
              value={specialValues[1]}
              onChange={e => setSpecialValues([specialValues[0], e.target.value, ''])}
              placeholder={t('messageTester.contactNumber')}
            />
          </div>
        )}
        {composerType === 'poll' && (
          <div className="chat-special-fields chat-poll-fields">
            <input
              value={specialValues[0]}
              onChange={e => setSpecialValues([e.target.value, '', ''])}
              placeholder={t('messageTester.pollQuestion')}
            />
            {pollOptions.map((option, index) => (
              <input
                key={index}
                value={option}
                onChange={e =>
                  setPollOptions(values => values.map((value, i) => (i === index ? e.target.value : value)))
                }
                placeholder={t('messageTester.pollOptionPlaceholder', { index: index + 1 })}
              />
            ))}
            {pollOptions.length < 12 && (
              <button type="button" onClick={() => setPollOptions(values => [...values, ''])}>
                + {t('common.add')}
              </button>
            )}
          </div>
        )}
        {(composerType === 'buttons' || composerType === 'orderConfirmation') && (
          <div className="chat-special-fields chat-poll-fields">
            <input
              value={specialValues[0]}
              onChange={e => setSpecialValues([e.target.value, '', ''])}
              placeholder={t('chats.buttonFooter')}
            />
            {composerType === 'buttons' ? (
              <>
                {pollOptions.slice(0, 3).map((option, index) => (
                  <input
                    key={index}
                    value={option}
                    onChange={e =>
                      setPollOptions(values => values.map((value, i) => (i === index ? e.target.value : value)))
                    }
                    placeholder={t('chats.buttonLabel', { index: index + 1 })}
                  />
                ))}
                {pollOptions.length < 3 && (
                  <button type="button" onClick={() => setPollOptions(values => [...values, ''])}>
                    + {t('common.add')}
                  </button>
                )}
              </>
            ) : (
              <div className="order-button-preview">
                <span>{t('chats.confirm')}</span>
                <span>{t('chats.cancel')}</span>
              </div>
            )}
          </div>
        )}
        {composerType === 'forward' && (
          <div className="chat-special-fields">
            <input
              value={specialValues[0]}
              onChange={e => setSpecialValues([e.target.value, specialValues[1], ''])}
              placeholder={t('messageTester.forwardMessageId')}
            />
            <input
              value={specialValues[1]}
              onChange={e => setSpecialValues([specialValues[0], e.target.value, ''])}
              placeholder={t('messageTester.forwardToPlaceholder')}
            />
          </div>
        )}
        <form onSubmit={handleSend} className="input-form">
          <input
            type="file"
            ref={fileInputRef}
            accept={mediaAccept[composerType]}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={triggerFileSelect}
            disabled={!canCompose || sending}
            className={`btn-input-accessory ${fileComposerTypes.includes(composerType) ? 'active' : ''}`}
            title={t('chats.attachTitle')}
          >
            <Paperclip size={20} />
          </button>

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={!canCompose || sending}
            className={`btn-input-accessory ${showEmojiPicker ? 'active' : ''}`}
            title={t('chats.emojiTitle')}
          >
            <Smile size={20} />
          </button>

          <input
            type="text"
            placeholder={
              canCompose
                ? attachment
                  ? t('chats.captionPlaceholder')
                  : t('chats.messagePlaceholder')
                : automationLocked
                  ? t('chats.handoffRequired')
                  : t('chats.noPermission')
            }
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            disabled={!canCompose || sending}
            className="message-text-input"
          />
          <button
            type="submit"
            disabled={
              !canCompose ||
              (fileComposerTypes.includes(composerType) ? !attachment : !messageInput.trim() && !canSendSpecial) ||
              sending
            }
            className="btn-send-message"
            aria-label={t('chats.send')}
          >
            {sending ? <Loader2 className="animate-spin" size={24} /> : <Send size={28} strokeWidth={2.5} />}
          </button>
        </form>
      </footer>
    </>
  );
}

export default ChatComposer;
