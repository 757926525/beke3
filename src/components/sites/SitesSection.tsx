import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { WebSiteItem } from '../../types';
import { SafeImage } from '../common/SafeImage';
import { translateInline } from '../../utils/i18n';
import {
  Globe,
  Plus,
  Trash2,
  ExternalLink,
  Upload,
  Sparkles,
  Link as LinkIcon,
  FileText,
  Shield,
  Layers,
  Download,
  List,
  LayoutGrid,
} from 'lucide-react';

export const SitesSection: React.FC = () => {
  const {
    websites,
    setWebsites,
    currentUser,
    systemSettings,
    updateSystemSettings,
    uploadFile,
    deleteUploadedFiles,
    locale,
  } = useApp();
  const tx = (source: string) => translateInline(locale, source);

  const isAdmin = currentUser?.role === 'admin';
  const canViewSites = isAdmin || Boolean(systemSettings.allowPublicSitesAccess);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [siteTitle, setSiteTitle] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [sitePoster, setSitePoster] = useState('');
  const [siteDesc, setSiteDesc] = useState('');
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [siteViewMode, setSiteViewMode] = useState<'cards' | 'details'>('cards');

  const posterInputRef = useRef<HTMLInputElement>(null);
  const bookmarksInputRef = useRef<HTMLInputElement>(null);

  const downloadText = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportSites = (items: WebSiteItem[], format: 'html' | 'txt') => {
    const safe = items.filter(item => /^https?:\/\//i.test(item.url));
    if (!safe.length) return;
    if (format === 'txt') {
      downloadText(`fox3-bookmarks-${Date.now()}.txt`, safe.map(item => `${item.title}\t${item.url}`).join('\n') + '\n', 'text/plain;charset=utf-8');
      return;
    }
    const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows = safe.map(item => `<DT><A HREF="${esc(item.url)}" ADD_DATE="${Math.floor((item.createdAt || Date.now()) / 1000)}">${esc(item.title)}</A>`).join('\n');
    downloadText(`fox3-bookmarks-${Date.now()}.html`, `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>fox3 Bookmarks</TITLE><H1>Bookmarks</H1>\n<DL><p>\n${rows}\n</DL><p>\n`, 'text/html;charset=utf-8');
  };
  const importBookmarks = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const imported: Array<{ title: string; url: string; description?: string }> = [];
    for (const file of files) {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        try {
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.websites) ? parsed.websites : [];
          for (const item of list) if (item && typeof item.url === 'string') imported.push({ title: String(item.title || item.name || item.url), url: item.url, description: String(item.description || '通过书签文件导入') });
        } catch { /* Ignore malformed JSON files and continue with other files. */ }
      } else if (/\.html?$/i.test(file.name) || /<a\b/i.test(text)) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
          const url = anchor.getAttribute('href') || '';
          if (/^https?:\/\//i.test(url)) imported.push({ title: anchor.textContent?.trim() || url, url, description: '通过浏览器书签 HTML 导入' });
        }
      } else {
        for (const line of text.split(/\r?\n/)) {
          const match = line.match(/https?:\/\/[^\s<>"']+/i); if (!match) continue;
          const title = line.slice(0, match.index).replace(/[\t|,; -]+$/, '').trim() || match[0];
          imported.push({ title, url: match[0], description: '通过 TXT 书签导入' });
        }
      }
    }
    const existing = new Set(websites.map(item => item.url.replace(/\/$/, '')));
    const additions: WebSiteItem[] = imported.filter(item => !existing.has(item.url.replace(/\/$/, ''))).map((item, index) => ({
      id: `site-import-${Date.now()}-${index}-${crypto.randomUUID().slice(0, 8)}`, title: item.title.slice(0, 160), url: item.url,
      poster: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', description: item.description || '书签导入', createdAt: Date.now(), updatedAt: Date.now(),
    }));
    if (additions.length) setWebsites(prev => [...additions, ...prev]);
    window.alert(`书签导入完成：新增 ${additions.length} 条，跳过/忽略 ${Math.max(0, imported.length - additions.length)} 条。`);
    event.target.value = '';
  };

  const handleUploadPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPoster(true);
    try {
      const res = await uploadFile(file);
      setSitePoster(res.url);
    } catch (err) {
      console.warn('Poster upload failed:', err);
    } finally {
      setIsUploadingPoster(false);
    }
  };

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteUrl.trim() || !siteTitle.trim()) return;

    let formattedUrl = siteUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const newSite: WebSiteItem = {
      id: `site-${Date.now()}`,
      title: siteTitle.trim(),
      url: formattedUrl,
      poster:
        sitePoster.trim() ||
        'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
      description: siteDesc.trim() || '无自定义说明',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setWebsites(prev => [newSite, ...prev]);
    setSiteTitle('');
    setSiteUrl('');
    setSitePoster('');
    setSiteDesc('');
    setIsModalOpen(false);
  };

  const handleDeleteSite = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定要移除站点【${title}】吗？`)) {
      const target = websites.find(s => s.id === id);
      setWebsites(prev => prev.filter(s => s.id !== id));
      if (target?.poster) {
        void deleteUploadedFiles([target.poster], { exclude: { websiteIds: [id] } });
      }
    }
  };

  if (!canViewSites) {
    return (
      <div className="py-20 text-center space-y-3">
        <Shield className="w-12 h-12 mx-auto text-rose-500/80" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-serif-sc">
          管理员专属功能区
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          此专区默认仅超级管理员登录后方可查阅和维护；管理员可在设置或本区顶部开关中开启公开浏览权限。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Header Card */}
      <div
        className={`p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          systemSettings.transparentCards
            ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
        }`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
              systemSettings.allowPublicSitesAccess
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/50'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/50'
            }`}>
              <Shield className="w-3 h-3" />
              <span>{systemSettings.allowPublicSitesAccess ? '已开启公开浏览 · 编辑限管理员' : '管理员专属专区'}</span>
            </div>
            {isAdmin && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-[11px] font-medium text-sky-700 dark:text-sky-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(systemSettings.allowPublicSitesAccess)}
                  onChange={e => updateSystemSettings({ allowPublicSitesAccess: e.target.checked })}
                  className="w-3.5 h-3.5 accent-sky-500 rounded cursor-pointer"
                />
                <span>非管理员可见</span>
              </label>
            )}
          </div>
          <h2 className="text-xl font-bold font-serif-sc text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Globe className="w-5 h-5 text-sky-500" />
            <span>网站与图床中心 (Websites & Image Host Hub)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            可视化海报式汇聚展示任何互联网站点、自建图床与分发节点，支持一键安全跳转与说明备忘
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border bg-white/70 p-1 dark:bg-slate-900/70" aria-label="网站显示方式">
            <button type="button" onClick={() => setSiteViewMode('cards')} title={tx('海报卡片视图')} aria-label={tx('海报卡片视图')} aria-pressed={siteViewMode === 'cards'} className={`rounded-lg p-1.5 ${siteViewMode === 'cards' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setSiteViewMode('details')} title={tx('网址详细列表')} aria-label={tx('网址详细列表')} aria-pressed={siteViewMode === 'details'} className={`rounded-lg p-1.5 ${siteViewMode === 'details' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}><List className="h-4 w-4" /></button>
          </div>
          {isAdmin && (
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-md transition shrink-0 cursor-pointer">
              <Plus className="w-4 h-4" /><span>添加新网站/图床</span>
            </button>
          )}
          <button onClick={() => exportSites(selectedSites.length ? websites.filter(site => selectedSites.includes(site.id)) : websites, 'html')} disabled={!websites.length} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs disabled:opacity-40"><Download className="h-3.5 w-3.5"/>{tx('下载所选/全部书签 HTML')} ({selectedSites.length || websites.length})</button>
          <button onClick={() => exportSites(selectedSites.length ? websites.filter(site => selectedSites.includes(site.id)) : websites, 'txt')} disabled={!websites.length} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs disabled:opacity-40">{tx('下载所选/全部 TXT')}</button>
          <button onClick={() => setSelectedSites(selectedSites.length === websites.length ? [] : websites.map(site => site.id))} className="rounded-xl border px-3 py-2 text-xs">{tx(selectedSites.length === websites.length ? '取消全选' : '全选书签')}</button>
          {isAdmin && (
            <>
              <button onClick={() => bookmarksInputRef.current?.click()} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs"><Upload className="h-3.5 w-3.5"/>{tx('上传/导入书签')}</button>
              <input ref={bookmarksInputRef} type="file" accept=".html,.htm,.txt,.json,text/html,text/plain,application/json" multiple onChange={importBookmarks} className="hidden" />
            </>
          )}
        </div>
      </div>

      {/* Websites: poster cards or detailed URL list */}
      {siteViewMode === 'cards' ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {websites.map(site => (
          <div
            key={site.id}
            className={`group rounded-3xl border shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col ${
              systemSettings.transparentCards
                ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
            }`}
          >
            {/* Poster Aspect Ratio Frame */}
            <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800">
              <SafeImage
                src={site.poster}
                alt={site.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />

              {/* Action floating buttons */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <label title="选择此站点加入批量书签文件" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-black/50 text-white"><input type="checkbox" checked={selectedSites.includes(site.id)} onChange={event => setSelectedSites(previous => event.target.checked ? [...previous, site.id] : previous.filter(id => id !== site.id))} className="h-4 w-4 accent-sky-500" aria-label={`选择${site.title}书签`} /></label>
                <button onClick={() => exportSites([site], 'html')} title="下载此网站书签 HTML" className="rounded-xl bg-black/40 p-2 text-white transition hover:bg-sky-600"><Download className="h-3.5 w-3.5"/></button>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="在新窗口打开站点"
                  className="p-2 rounded-xl bg-black/40 hover:bg-black/70 backdrop-blur-md text-white transition shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {isAdmin && (
                  <button
                    onClick={(e) => handleDeleteSite(site.id, site.title, e)}
                    title="删除站点"
                    className="p-2 rounded-xl bg-black/40 hover:bg-rose-600/80 backdrop-blur-md text-white transition shadow-sm cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Title overlay on poster */}
              <div className="absolute bottom-3 left-4 right-4">
                <h3 className="text-base font-bold text-white font-serif-sc drop-shadow-md truncate">
                  {site.title}
                </h3>
              </div>
            </div>

            {/* URL & Description Area */}
            <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
              <div>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono font-medium text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1.5 break-all"
                >
                  <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{site.url}</span>
                </a>

                {/* Custom description below address */}
                <div className="mt-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/80 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="whitespace-pre-wrap">{site.description}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>添加时间: {new Date(site.createdAt).toLocaleDateString()}</span>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-500 hover:text-sky-600 font-medium"
                >
                  <span>立即访问</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div> : <div className="space-y-3">
        {websites.map(site => (
          <div key={site.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
            <SafeImage src={site.poster} alt={site.title} className="h-20 w-full shrink-0 rounded-xl sm:w-32" imageClassName="object-cover" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{site.title}</h3>
              <a href={site.url} target="_blank" rel="noopener noreferrer" className="block break-all font-mono text-xs text-sky-600 hover:underline dark:text-sky-400">{site.url}</a>
              <p className="whitespace-pre-wrap break-words text-xs text-slate-500 dark:text-slate-400">{site.description || '—'}</p>
              <span className="text-[10px] text-slate-400">{tx('添加时间')}：{new Date(site.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
              <input type="checkbox" checked={selectedSites.includes(site.id)} onChange={event => setSelectedSites(previous => event.target.checked ? [...previous, site.id] : previous.filter(id => id !== site.id))} aria-label={`选择${site.title}书签`} className="h-4 w-4 accent-sky-500" />
              <button type="button" onClick={() => exportSites([site], 'html')} title={tx('下载书签')} aria-label={tx('下载书签')} className="rounded-lg p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-600"><Download className="h-4 w-4" /></button>
              <a href={site.url} target="_blank" rel="noopener noreferrer" title={tx('打开站点')} aria-label={tx('打开站点')} className="rounded-lg p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-600"><ExternalLink className="h-4 w-4" /></a>
              {isAdmin && <button type="button" onClick={event => handleDeleteSite(site.id, site.title, event)} title="删除站点" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        ))}
      </div>}

      {/* Add Website Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold font-serif-sc text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Globe className="w-5 h-5 text-sky-500" />
                <span>添加新站点 / 图床</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                关闭
              </button>
            </div>

            <form onSubmit={handleAddSite} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-200 mb-1">
                  站点名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={siteTitle}
                  onChange={e => setSiteTitle(e.target.value)}
                  placeholder="例如: 白狐图床中心 / 官方工具箱"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-200 mb-1">
                  跳转地址 (URL) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={siteUrl}
                  onChange={e => setSiteUrl(e.target.value)}
                  placeholder="例如: https://img.001315.xyz/"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-200 mb-1">
                  海报展示图 (Poster URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sitePoster}
                    onChange={e => setSitePoster(e.target.value)}
                    placeholder="https://... 或点击右侧上传海报"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => posterInputRef.current?.click()}
                    disabled={isUploadingPoster}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingPoster ? '上传中...' : '上传海报'}</span>
                  </button>
                  <input
                    type="file"
                    ref={posterInputRef}
                    onChange={handleUploadPoster}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-200 mb-1">
                  自定义网站说明 (将显示在链接下方)
                </label>
                <textarea
                  rows={3}
                  value={siteDesc}
                  onChange={e => setSiteDesc(e.target.value)}
                  placeholder="输入站点的功能介绍、接口说明或专属使用备忘..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl shadow-xs transition"
                >
                  保存站点
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
