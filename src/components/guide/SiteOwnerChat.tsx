import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Send, Paperclip, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getAdminSessionToken } from '../../utils/adminSession';
import { getUserSessionToken } from '../../utils/userSession';
import { translateInline } from '../../utils/i18n';

type Conversation = { id: string; username?: string; lastMessage?: string; unread?: number };
type Attachment = { name: string; url: string; mime: string; size: number };
type Message = { id: string; senderRole: 'admin' | 'user'; senderName: string; message: string; createdAt: number };
const parseMessage = (raw: string): { text: string; attachments: Attachment[] } => {
  try {
    const value = JSON.parse(raw);
    if (value?.type === 'siteowner-chat-v1' && typeof value.text === 'string' && Array.isArray(value.attachments)) {
      const attachments = value.attachments.filter((a: any) => {
        if (!a || typeof a.name !== 'string' || typeof a.url !== 'string' || typeof a.mime !== 'string' || !Number.isFinite(a.size)) return false;
        try { const url = new URL(a.url, window.location.origin); return (url.origin === window.location.origin && /^\/api\/files\//.test(url.pathname)) || (url.protocol === 'https:' && /^(?:[a-z0-9-]+\.)?r2\.dev$/.test(url.hostname)); } catch { return false; }
      });
      return { text: value.text, attachments };
    }
  } catch {}
  return { text: raw, attachments: [] };
};

interface SiteOwnerChatProps {
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
}

export const SiteOwnerChat: React.FC<SiteOwnerChatProps> = ({ open, onToggle, defaultOpen = false }) => {
  const { currentUser, locale, uploadFile } = useApp();
  const tx = (source: string) => translateInline(locale, source);
  const admin = currentUser?.role === 'admin';
  const token = admin ? getAdminSessionToken() : getUserSessionToken();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen(value => !value);
  };

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (url: string, init: RequestInit = {}) => {
    if (!token) throw new Error(tx('请先登录账户，再向站长发送消息。'));
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || `请求失败 (${response.status})`);
    return data;
  }, [token]);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/api/chat/conversations');
      const list: Conversation[] = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(list);
      setConversationId(previous => previous && list.some(item => item.id === previous) ? previous : (list[0]?.id || ''));
    } catch (e) { setError(e instanceof Error ? e.message : tx('无法读取站长对话')); }
  }, [api, token]);

  const loadMessages = useCallback(async (id: string) => {
    if (!id) { setMessages([]); return; }
    try {
      const data = await api(`/api/chat/messages?conversationId=${encodeURIComponent(id)}`);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) { setError(e instanceof Error ? e.message : tx('无法读取消息')); }
  }, [api]);

  useEffect(() => { setConversations([]); setMessages([]); setConversationId(''); void loadConversations(); }, [currentUser?.id, loadConversations]);
  useEffect(() => { void loadMessages(conversationId); }, [conversationId, loadMessages]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if ((!message && !attachments.length) || busy || uploading) return;
    setBusy(true); setError('');
    try {
      const result = await api('/api/chat/messages', { method: 'POST', body: JSON.stringify({ ...(conversationId ? { conversationId } : {}), message: message || '', ...(attachments.length ? { attachments } : {}) }) });
      setDraft('');
      setAttachments([]);
      const id = String(result.conversationId || conversationId);
      setConversationId(id);
      await loadConversations();
      if (id) await loadMessages(id);
    } catch (e) { setError(e instanceof Error ? e.message : tx('消息发送失败')); }
    finally { setBusy(false); }
  };

  return (
    <aside className="rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <MessageCircle className="h-5 w-5 text-sky-500" />
          <span>{tx('站长对话板')}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
          <span>{isOpen ? tx('收拢') : tx('展开')}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="text-xs leading-relaxed text-slate-500">{tx('消息保存于 D1 客服会话。普通用户发送后，管理员页眉消息灯会提醒；管理员可在此选择会话并回复。')}</p>
          {!currentUser && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{tx('请先登录或注册账户后发送消息。访客消息不会伪装成已送达。')}</p>}
          {currentUser && <>
            {admin && <label className="mt-3 block text-xs font-semibold">{tx('用户会话')}<select value={conversationId} onChange={event => setConversationId(event.target.value)} className="mt-1 w-full rounded-xl border bg-transparent p-2 text-sm dark:border-slate-700"><option value="">{tx('选择一个用户会话')}</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.username || item.id}{item.unread ? ` · ${tx('未读')} ${item.unread}` : ''}</option>)}</select></label>}
            <div className="mt-3 max-h-60 space-y-2 overflow-auto rounded-xl border-y border-slate-200 py-3 dark:border-slate-700">
              {messages.map(message => <div key={message.id} className={`max-w-[90%] rounded-xl px-3 py-2 text-xs ${message.senderRole === 'admin' ? 'bg-slate-100 dark:bg-slate-800' : 'ml-auto bg-sky-50 dark:bg-sky-950/40'}`}><div className="mb-1 text-[10px] text-slate-500">{message.senderName} · {new Date(message.createdAt).toLocaleString()}</div>{(() => { const parsed = parseMessage(message.message); return <><p className="whitespace-pre-wrap break-words">{parsed.text}</p>{parsed.attachments.map((attachment, index) => <div key={`${attachment.url}-${index}`} className="mt-2">{attachment.mime.startsWith('image/') && <a href={attachment.url} target="_blank" rel="noopener noreferrer"><img src={attachment.url} alt={attachment.name} loading="lazy" className="mb-1 max-h-40 max-w-full rounded-lg object-contain"/></a>}<a href={attachment.url} target="_blank" rel="noopener noreferrer" download={attachment.name} className="break-all text-sky-600 underline dark:text-sky-400">{attachment.name} · {(attachment.size / 1024).toFixed(0)} KB</a></div>)}</>; })()}</div>)}
              {!messages.length && <p className="text-xs text-slate-400">{admin ? (conversationId ? tx('此会话暂无消息。') : tx('选择一个用户会话后即可查看或回复。')) : tx('还没有对话，发出第一条消息开始联系站长。')}</p>}
            </div>
            <form onSubmit={send} className="mt-3 space-y-2"><div className="flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} placeholder={admin && !conversationId ? tx('先选择用户会话') : tx('输入消息…')} disabled={admin && !conversationId} className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"/><label className="flex cursor-pointer items-center rounded-xl border px-3 dark:border-slate-700" title={tx('添加图片或文件')}><Paperclip className="h-4 w-4"/><input type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.json" className="hidden" disabled={uploading || (admin && !conversationId)} onChange={async event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return; setUploading(true); setError(''); try { if (attachments.length + files.length > 5) throw new Error(tx('最多添加5个附件')); const added: Attachment[] = []; for (const file of files) { if (file.size > 20 * 1024 * 1024) throw new Error(tx('单个附件不能超过20 MB')); const uploaded = await uploadFile(file); if (!uploaded.url.startsWith('/api/files/')) throw new Error(tx('文件仅保存在本浏览器，无法发送；请配置云端存储后重新上传')); added.push({ name: file.name.slice(0, 180), url: uploaded.url, mime: file.type || 'application/octet-stream', size: uploaded.size || file.size }); } setAttachments(previous => [...previous, ...added]); } catch (e) { setError(e instanceof Error ? e.message : tx('文件上传失败')); } finally { setUploading(false); } }}/></label><button type="submit" disabled={(!draft.trim() && !attachments.length) || busy || uploading || (admin && !conversationId)} aria-label={tx('发送消息给站长')} className="rounded-xl bg-sky-500 px-3 text-white disabled:opacity-40"><Send className="h-4 w-4"/></button></div>{attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((file, index) => <span key={`${file.url}-${index}`} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{file.name}<button type="button" aria-label={tx('移除附件')} onClick={() => setAttachments(value => value.filter((_, i) => i !== index))}><X className="h-3 w-3"/></button></span>)}</div>}{uploading && <p className="text-xs text-slate-500">{tx('正在上传附件…')}</p>}</form>
          </>}
          {error && <p role="alert" className="mt-2 break-words text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </aside>
  );
};
