import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, FileText, Loader2, Pencil, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getAdminSessionToken } from '../../utils/adminSession';

type LegalPageKey = 'refund' | 'privacy' | 'terms' | 'contact';
type LegalPages = Record<LegalPageKey, string>;

const PAGE_ITEMS: Array<{ key: LegalPageKey; label: string; description: string }> = [
  { key: 'refund', label: '退款政策', description: '退款与取消说明' },
  { key: 'privacy', label: '隐私政策', description: '个人信息与隐私保护' },
  { key: 'terms', label: '服务条款', description: '服务使用规则' },
  { key: 'contact', label: '联系方式', description: '联系站点与客服' },
];
const EMPTY_PAGES: LegalPages = { refund: '', privacy: '', terms: '', contact: '' };

async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('服务器返回了无法识别的数据，请稍后重试。');
  return response.json();
}

function parsePages(value: unknown): LegalPages {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('法律页面数据格式无效。');
  const source = value as Record<string, unknown>;
  const pages = { ...EMPTY_PAGES };
  for (const key of PAGE_ITEMS.map(item => item.key)) {
    if (source[key] !== undefined && typeof source[key] !== 'string') throw new Error('法律页面内容格式无效。');
    pages[key] = typeof source[key] === 'string' ? source[key] as string : '';
  }
  return pages;
}

export const LegalPagesSection: React.FC = () => {
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [pages, setPages] = useState<LegalPages>(EMPTY_PAGES);
  const [draft, setDraft] = useState<LegalPages>(EMPTY_PAGES);
  const [activePage, setActivePage] = useState<LegalPageKey>('refund');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPages = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/legal-pages', { headers: { Accept: 'application/json' }, signal });
      const result = await readJson(response) as { success?: unknown; pages?: unknown; error?: unknown };
      if (!response.ok || result?.success !== true) throw new Error(typeof result?.error === 'string' ? result.error : `读取政策失败（HTTP ${response.status}）。`);
      const parsed = parsePages(result.pages);
      setPages(parsed);
      setDraft(parsed);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : '暂时无法加载法律页面。');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPages(controller.signal);
    return () => controller.abort();
  }, [loadPages]);

  const beginEditing = () => {
    setDraft(pages);
    setNotice('');
    setError('');
    setEditing(true);
  };
  const cancelEditing = () => {
    setDraft(pages);
    setEditing(false);
    setError('');
    setNotice('');
  };
  const savePages = async () => {
    if (!isAdmin || saving) return;
    const token = getAdminSessionToken();
    if (!token) {
      setError('未找到管理员会话，请重新登录后再保存。');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/legal-pages', {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pages: draft }),
      });
      const result = await readJson(response) as { success?: unknown; error?: unknown; pages?: unknown };
      if (!response.ok || result?.success !== true) throw new Error(typeof result?.error === 'string' ? result.error : `保存失败（HTTP ${response.status}）。`);
      const saved = result.pages === undefined ? draft : parsePages(result.pages);
      setPages(saved);
      setDraft(saved);
      setEditing(false);
      setNotice('政策内容已保存。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法保存法律页面。');
    } finally {
      setSaving(false);
    }
  };

  const selected = PAGE_ITEMS.find(item => item.key === activePage)!;
  return (
    <section className="mx-auto w-full max-w-5xl px-1 sm:px-6 py-4 sm:py-8 lg:py-12 min-w-0">
      <header className="mb-6 rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2.5 inline-flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-300"><ShieldCheck className="h-4 w-4 shrink-0" /><span>站点信息</span></div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white break-words">政策与联系</h1>
            <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-6 text-slate-500 dark:text-slate-400 break-words">查阅站点政策与联系方式。商品和价格由 Shop 管理；首页内容由 Blog 管理。</p>
          </div>
          {isAdmin && !editing && <button type="button" onClick={beginEditing} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500 shrink-0"><Pencil className="h-4 w-4" />编辑政策</button>}
          {isAdmin && editing && <div className="flex flex-wrap gap-2"><button type="button" onClick={cancelEditing} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" />取消</button><button type="button" onClick={() => void savePages()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? '保存中…' : '保存更改'}</button></div>}
        </div>
        <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 sm:p-4 text-xs sm:text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="mt-1 h-4 w-4 shrink-0" /><p className="min-w-0 break-words">这些政策内容属于草稿，发布前请站长依据实际业务、经营主体和适用法律审阅；本页面内容不构成法律意见。</p></div>
      </header>

      {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{error}</span></div>}
      {notice && <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><Check className="h-4 w-4 shrink-0" /><span>{notice}</span></div>}

      <div className="flex flex-col gap-4">
        <nav aria-label="法律页面" className="flex items-center gap-2 overflow-x-auto touch-pan-x rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {PAGE_ITEMS.map(item => <button key={item.key} type="button" onClick={() => setActivePage(item.key)} aria-current={activePage === item.key ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-left transition whitespace-nowrap ${activePage === item.key ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}><FileText className="h-4 w-4 shrink-0" /><span className="text-xs sm:text-sm font-semibold">{item.label}</span></button>)}
        </nav>
        <article className="min-w-0 min-h-80 rounded-2xl border border-slate-200 bg-white p-4 sm:p-7 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800"><h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{selected.label}</h2><p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{selected.description}</p></div>
          {loading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />正在加载政策…</div> : editing ? <textarea aria-label={`编辑${selected.label}`} value={draft[activePage]} onChange={event => setDraft(previous => ({ ...previous, [activePage]: event.target.value }))} rows={18} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-sky-900" placeholder={`在此输入${selected.label}内容…`} /> : <div className="min-h-44 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 dark:text-slate-300">{pages[activePage] || <span className="italic text-slate-400">暂无{selected.label}内容。</span>}</div>}
        </article>
      </div>
    </section>
  );
};
