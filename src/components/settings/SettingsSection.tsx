import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SafeImage } from '../common/SafeImage';
import { loadLocalStorage, saveLocalStorage, saveFileToIndexedDB } from '../../utils/storage';
import {
  Settings,
  Palette,
  Image as ImageIcon,
  HardDrive,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
  Check,
  Lock,
  RotateCcw,
  RotateCw,
  Layers,
  Sparkles,
  Sun,
  Moon,
  Save,
  Trash2,
  ShieldCheck,
  CheckCircle,
  Globe,
  Calendar as CalendarIcon,
  Languages,
  Clock,
  Type,
  Upload,
} from 'lucide-react';
import { GlobalThemeMode } from '../../types';
import { translateInline } from '../../utils/i18n';
import { SiteOwnerChat } from '../guide/SiteOwnerChat';
import { getAdminSessionToken } from '../../utils/adminSession';

export const SettingsSection: React.FC = () => {
  const {
    systemSettings,
    updateSystemSettings,
    currentUser,
    setCurrentUser,
    deviceMode,
    setDeviceMode,
    uploadFile,
    locale,
    t,
    syncState,
    triggerManualSync,
    channelConnected,
    cloudServicesStatus,
    refreshChannelStatus,
    showToast,
  } = useApp();
  const tx = (source: string) => translateInline(locale, source);

  const {
    themeMode,
    setThemeMode,
  } = useApp();

  // In-page translator state with custom API support
  const [translateSource, setTranslateSource] = useState('zh');
  type NotebookEntry = { id: string; text: string; images: string[] };
  const [notebookEntries, setNotebookEntries] = useState<NotebookEntry[]>([]);
  const [notebookBusy, setNotebookBusy] = useState(false);
  const [showThemeHelp, setShowThemeHelp] = useState(false);
  const [translateTarget, setTranslateTarget] = useState('en');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [translateConfig, setTranslateConfig] = useState<{
    engine: 'free' | 'custom';
    apiUrl: string;
    apiKey: string;
  }>(() => loadLocalStorage('fox3_translate_config', {
    engine: 'free',
    apiUrl: 'https://api.mymemory.translated.net/get',
    apiKey: '',
  }));

  const [translateDraft, setTranslateDraft] = useState(translateConfig);
  const [isTranslateSaved, setIsTranslateSaved] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{ r2Bytes: number; r2Files: number; d1FallbackBytes: number; d1FallbackFiles: number; exact: boolean; note: string } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  const handleSaveTranslateConfig = () => {
    setTranslateConfig(translateDraft);
    saveLocalStorage('fox3_translate_config', translateDraft);
    setIsTranslateSaved(true);
    showToast('外部翻译 API 配置已成功保存并即时生效！', 'success');
    setTimeout(() => setIsTranslateSaved(false), 2000);
  };

  // Timezone options
  const timezoneOptions = [
    { label: '北京时间 / 中国标准时间 (UTC+8)', value: 'Asia/Shanghai' },
    { label: '世界标准时间 (UTC)', value: 'UTC' },
    { label: '东京时间 (UTC+9)', value: 'Asia/Tokyo' },
    { label: '伦敦时间 (UTC+0 / GMT)', value: 'Europe/London' },
    { label: '纽约时间 (UTC-5 / EST)', value: 'America/New_York' },
    { label: '洛杉矶时间 (UTC-8 / PST)', value: 'America/Los_Angeles' },
  ];

  // Collapsible section toggles: default to collapsed (true = collapsed, false = open)
  // State is persisted in localStorage so user preferences are remembered!
  const [collapsedSections, setCollapsedSections] = useState<{ [key: string]: boolean }>(() => {
    const saved = loadLocalStorage<{ [key: string]: boolean }>('fox3_settings_collapsed_state', {
      theme: true,
      themeCenter: true,
      privacy: true,
      storage: true,
      password: true,
      ownerChat: true,
      calendar: true,
      translate: true,
      notebook: true,
      themeHelp: true,
    });
    return {
      ...saved,
      privacy: saved.privacy ?? saved.privacyUsers ?? true,
      ownerChat: saved.ownerChat ?? true,
      calendar: saved.calendar ?? true,
      translate: saved.translate ?? true,
    };
  });

  useEffect(() => {
    const token = getAdminSessionToken();
    if (!token) return;
    void fetch('/api/admin/notebook', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' })
      .then(response => response.json().then(data => ({ response, data })))
      .then(({ response, data }) => { if (response.ok && data.success) { const raw = String(data.content || ''); try { const parsed = JSON.parse(raw); if (parsed?.format === 'fox3-notebook-v1' && Array.isArray(parsed.entries)) setNotebookEntries(parsed.entries.map((entry: any, i: number) => ({ id: String(entry.id || `note-${i}`), text: String(entry.text || ''), images: Array.isArray(entry.images) ? entry.images.map(String) : [] }))); else setNotebookEntries(raw ? [{ id: 'legacy-note', text: raw, images: [] }] : []); } catch { setNotebookEntries(raw ? [{ id: 'legacy-note', text: raw, images: [] }] : []); } } })
      .catch(() => undefined);
  }, [currentUser?.role]);
  const saveNotebook = async (entries = notebookEntries) => {
    const token = getAdminSessionToken();
    if (!token) { showToast(tx('需要管理员会话才能保存记事本'), 'error'); return; }
    setNotebookBusy(true);
    try {
      const response = await fetch('/api/admin/notebook', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: JSON.stringify({ format: 'fox3-notebook-v1', entries }) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || tx('保存失败'));
      showToast(tx('记事本已保存并同步至 D1'), 'success');
    } catch (error: any) { showToast(error?.message || tx('记事本保存失败'), 'error'); }
    finally { setNotebookBusy(false); }
  };
  const deleteNotebookEntry = async (id: string) => {
    const next = notebookEntries.filter(entry => entry.id !== id);
    setNotebookEntries(next);
    await saveNotebook(next);
  };
  const addNotebookEntry = () => setNotebookEntries(entries => [...entries, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: '', images: [] }]);
  const uploadNotebookImage = async (id: string, file: File) => {
    try {
      const uploaded = await uploadFile(file);
      if (!uploaded?.url || uploaded.url.startsWith('idb_file_')) throw new Error(tx('图片未能上传到持久化云端存储'));
      const next = notebookEntries.map(entry => entry.id === id ? { ...entry, images: [...entry.images, uploaded.url] } : entry);
      setNotebookEntries(next);
      await saveNotebook(next);
      showToast(tx('图片已上传并保存记事本链接'), 'success');
    } catch (error: any) { showToast(error?.message || tx('图片上传失败'), 'error'); }
  };
  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveLocalStorage('fox3_settings_collapsed_state', next);
      return next;
    });
  };

  const refreshStorage = async () => {
    const token = getAdminSessionToken();
    if (!token) return;
    setStorageLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const usageResponse = await fetch('/api/storage/usage', { headers, cache: 'no-store' });
      const usage = await usageResponse.json();
      if (!usageResponse.ok || usage.success === false) throw new Error(usage.error || '存储统计读取失败');
      setStorageUsage(usage);
    } catch (error: any) {
      showToast(error?.message || '无法读取真实存储数据', 'error');
      setStorageUsage(null);
    } finally { setStorageLoading(false); }
  };
  useEffect(() => { if (currentUser?.role === 'admin') void refreshStorage(); }, [currentUser?.id]);

  const handleQuickTranslate = async () => {
    if (!sourceText.trim()) return;
    setIsTranslating(true);

    try {
      // 1. If custom API is configured and enabled
      if (translateConfig.engine === 'custom' && translateConfig.apiUrl) {
        const res = await fetch(translateConfig.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(translateConfig.apiKey ? { Authorization: `Bearer ${translateConfig.apiKey}` } : {}),
          },
          body: JSON.stringify({
            q: sourceText,
            source: translateSource,
            target: translateTarget,
            format: 'text',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const translated = data?.translatedText || data?.choices?.[0]?.message?.content || data?.result;
          if (translated) {
            setTranslatedText(translated);
            setIsTranslating(false);
            return;
          }
        }
      }

      // 2. Public high-availability free translator API (MyMemory)
      const langPair = `${translateSource}|${translateTarget}`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=${langPair}`;
      const apiRes = await fetch(url).catch(() => null);

      if (apiRes && apiRes.ok) {
        const json = await apiRes.json();
        if (json?.responseData?.translatedText) {
          setTranslatedText(json.responseData.translatedText);
          setIsTranslating(false);
          return;
        }
      }

      // 3. Fallback dictionary
      const basicDictZhToEn: Record<string, string> = {
        'fox3': 'fox3',
        '博客': 'Blog',
        '你好': 'Hello',
        '世界': 'World',
        '欢迎': 'Welcome',
        '部署': 'Deploy',
        '设置': 'Settings',
        'WebDAV': 'NutStore',
        '文章': 'Post',
        '书架': 'Bookshelf',
        '相册': 'Gallery',
        '影音': 'Media',
        '商品': 'Shop',
        '邮箱': 'Mail',
        '订单': 'Orders',
        '密码': 'Password',
        '管理员': 'Administrator',
      };
      const basicDictEnToZh: Record<string, string> = {
        'fox3': 'fox3',
        'blog': '博客',
        'hello': '你好',
        'world': '世界',
        'welcome': '欢迎',
        'deploy': '部署',
        'settings': '设置',
        'nutstore': 'WebDAV',
        'post': '文章',
        'bookshelf': '书架',
        'gallery': '相册',
        'media': '影音',
        'shop': '商品',
        'mail': '邮箱',
        'order': '订单',
        'password': '密码',
        'admin': '管理员',
      };

      const lower = sourceText.toLowerCase().trim();
      if (translateTarget === 'zh' && basicDictEnToZh[lower]) {
        setTranslatedText(basicDictEnToZh[lower]);
      } else if (translateTarget === 'en' && basicDictZhToEn[sourceText.trim()]) {
        setTranslatedText(basicDictZhToEn[sourceText.trim()]);
      } else {
        setTranslatedText(translateTarget === 'en' ? `[EN Translation]: ${sourceText}` : `[中文翻译]: ${sourceText}`);
      }
    } catch {
      setTranslatedText(translateTarget === 'en' ? `[EN]: ${sourceText}` : `[ZH]: ${sourceText}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const fullBgInputRef = useRef<HTMLInputElement>(null);
  const heroBgInputRef = useRef<HTMLInputElement>(null);

  const { adminUsername, adminPassword, updateAdminPassword, updateAdminUsername } = useApp();

  // Password & Username change state
  const [customAdminName, setCustomAdminName] = useState(adminUsername);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  useEffect(() => {
    setCustomAdminName(adminUsername);
  }, [adminUsername]);

  // Modern design themes; removed legacy IDs are normalized below.
  const aestheticThemes: {
    id: GlobalThemeMode;
    name: string;
    icon: string;
    color: string;
    bg: string;
    desc: string;
  }[] = [
    { id: 'modern', name: '现代流体玻璃', icon: '✨', color: '#0ea5e9', bg: '#f8fafc', desc: '极简现代流体设计、优雅微投影与半透明层次' },
    { id: 'win98', name: '微软 Windows 98 怀旧', icon: '🪟', color: '#000080', bg: '#008080', desc: '经典青绿视窗桌面与复古边框' },
    { id: 'mac-classic', name: '麦金塔 Classic Platinum', icon: '🍏', color: '#333333', bg: '#7b8893', desc: '经典金属灰与细腻条纹浮雕质感' },
    { id: 'cyberpunk', name: '赛博朋克霓虹', icon: '⚡', color: '#f72585', bg: '#0d0221', desc: '暗紫底色与荧光粉青色光影' },
    { id: 'nordic', name: '北欧极简原木', icon: '❄️', color: '#5e81ac', bg: '#eceff4', desc: '冷淡灰蓝与舒缓自然的极简气质' },
    { id: 'leather', name: '复古皮质笔记本', icon: '📔', color: '#cdaa7d', bg: '#3d2314', desc: '深褐皮革与温暖书页色调' },
    { id: 'blueprint', name: '工程架构蓝图', icon: '📐', color: '#328cc1', bg: '#0b3c5d', desc: '深蓝底色、线框网格与清晰层次' },
    { id: 'aurora-glass', name: '极光玻璃', icon: '🌌', color: '#14b8a6', bg: '#102a43', desc: '深海蓝渐层、青绿极光与通透玻璃层' },
    { id: 'neo-brutal', name: '新野兽派', icon: '🟨', color: '#facc15', bg: '#fff7d6', desc: '高对比原色、粗黑描边与硬朗投影' },
    { id: 'soft-pastel', name: '柔雾粉彩', icon: '🌷', color: '#c084fc', bg: '#fbf5ff', desc: '低饱和薰衣草、奶油白与柔和圆角' },
    { id: 'editorial', name: '编辑部留白', icon: '📰', color: '#c2410c', bg: '#f7f5f0', desc: '纸本文字排版、克制橘红与清晰分隔线' },
    { id: 'pearl-mist', name: '珍珠雾白', icon: '🤍', color: '#9b8f85', bg: '#f5f2ee', desc: '珍珠白、柔雾灰与细腻暖调光泽' },
    { id: 'sage-atelier', name: '鼠尾草工坊', icon: '🌿', color: '#71836b', bg: '#eff1e9', desc: '鼠尾草绿与亚麻白，安静自然且雅致' },
    { id: 'terracotta', name: '陶土暖意', icon: '🪴', color: '#b9694b', bg: '#f4ebe4', desc: '手作陶土、奶油米色与温润大地色' },
    { id: 'coastal-blue', name: '海岸蓝调', icon: '🌊', color: '#4f7890', bg: '#edf3f4', desc: '海盐白、雾蓝与清爽通透的海岸气息' },
    { id: 'velvet-plum', name: '丝绒梅紫', icon: '🍇', color: '#805b78', bg: '#f2edf1', desc: '柔和梅紫、浅灰粉与低调丝绒质感' },
  ];

  useEffect(() => {
    const removedThemes = ['terminal', 'parchment', 'gameboy', 'steampunk', 'midnight-luxe'];
    if (removedThemes.includes(themeMode as string)) {
      setThemeMode('modern');
      updateSystemSettings({ themeColor: '#0ea5e9', customPaletteBg: '#f8fafc' });
    }
  }, [themeMode, setThemeMode, updateSystemSettings]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    updateSystemSettings({ avatarUrl: res.url });
    if (currentUser?.role === 'admin') {
      setCurrentUser({ ...currentUser, avatar: res.url });
    }
  };

  const handleFullBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    updateSystemSettings({ fullBackgroundUrl: res.url });
  };

  const handleHeroBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    updateSystemSettings({ heroIntroImage: res.url });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isLocalDevelopment) {
      setPasswordMsg('生产管理员自行选择至少 6 个字符的登录密码（可为数字或任意字符），仅在 Cloudflare Pages → Settings → Variables and Secrets 设置 ADMIN_PASSWORD 后重新部署。本页不能修改部署 Secret；ADMIN_SESSION_SECRET 是独立且至少 32 字符的会话密钥。');
      return;
    }
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordMsg('两次输入的新密码不一致，请重新核对！');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg('密码长度不能少于 6 位！');
      return;
    }

    // Verify current admin password
    const validCurrent = adminPassword || '';
    if (currentPassword !== validCurrent) {
      setPasswordMsg('当前密码输入不正确，请重新输入！');
      return;
    }

    // Apply update and guarantee uniqueness
    updateAdminPassword(newPassword);
    if (customAdminName && customAdminName.trim() !== adminUsername) {
      updateAdminUsername(customAdminName.trim());
    }
    setPasswordMsg(`本机开发管理员密码已更新；不会修改 Cloudflare 部署 Secret。`);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordMsg(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className={`p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div>
          <h2 className="text-xl font-bold font-serif-sc text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-500" />
            <span>系统设置与外观隐私控制中枢</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            全站定制调色、夜间模式、背景照片、隐私保护与存储云盘管理
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setDeviceMode(deviceMode === 'mobile' ? 'responsive' : 'mobile');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
          >
            {deviceMode === 'mobile' ? (
              <Smartphone className="w-4 h-4 text-sky-500" />
            ) : (
              <Monitor className="w-4 h-4 text-indigo-500" />
            )}
            <span>
              {deviceMode === 'mobile' ? '手机端视图' : '电脑/响应式视图'}
            </span>
          </button>
        </div>
      </div>

      <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden`}>
        <button type="button" onClick={()=>toggleSection('notebook')} aria-expanded={!collapsedSections.notebook} className="w-full flex items-center justify-between p-5 text-left"><span className="text-sm font-bold">{tx('同步记事本')}</span>{collapsedSections.notebook?<ChevronDown className="w-4 h-4"/>:<ChevronUp className="w-4 h-4"/>}</button>
        {!collapsedSections.notebook&&<div className="p-5 pt-0 space-y-3"><p className="text-xs text-slate-500">{tx('记事本通过管理员会话私密保存到 D1；每条可单独编辑、附图并保存，旧版纯文本会自动作为一条记录显示。')}</p>
          <div className="space-y-3">{notebookEntries.map((entry, index) => <article key={entry.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 min-w-0"><div className="flex items-center justify-between gap-2"><strong className="text-xs">{tx('记事')} {index + 1}</strong><button type="button" disabled={notebookBusy} onClick={() => void deleteNotebookEntry(entry.id)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600">{tx('删除此条')}</button></div><textarea value={entry.text} onChange={e => setNotebookEntries(items => items.map(item => item.id === entry.id ? { ...item, text: e.target.value } : item))} rows={4} className="w-full min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent p-3 text-sm" placeholder={tx('填写备忘内容…')}/>{entry.images.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{entry.images.map((url, i) => <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${tx('记事图片')} ${i + 1}`} className="w-full h-24 object-cover rounded-lg" /></a>)}</div>}<label className="inline-flex cursor-pointer rounded-lg border px-3 py-2 text-xs">{tx('添加图片')}<input type="file" accept="image/*" className="hidden" onChange={e => { const file=e.target.files?.[0]; if(file) void uploadNotebookImage(entry.id,file); e.currentTarget.value=''; }} /></label></article>)}</div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={addNotebookEntry} className="rounded-xl border px-4 py-2 text-xs">{tx('新增记事')}</button><button type="button" onClick={() => void saveNotebook()} disabled={notebookBusy} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{notebookBusy?tx('保存中…'):tx('保存并同步全部')}</button></div></div>}
      </section>
      {/* SECTION 1: 主题调色与全局背景自定义选区 (从上到下按键功能顺序严格对应) */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-all duration-300 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsedSections.theme}
          onClick={() => toggleSection('theme')}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleSection('theme');
            }
          }}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-sky-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              主题调色与全局背景自定义选区 (可展开/收拢)
            </h3>
          </div>
          {collapsedSections.theme ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {!collapsedSections.theme && (
          <div className="p-6 space-y-6">
            {/* 1. 自定义网站名称 与 全站时区设定 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  1. {t('settings.siteName')}
                </label>
                <input
                  type="text"
                  value={systemSettings.siteName}
                  onChange={e => updateSystemSettings({ siteName: e.target.value })}
                  placeholder="fox3"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{tx('页眉副标语')}（CLOUDFLARE NATIVE • FOX3）</label>
                <input type="text" maxLength={80} value={systemSettings.headerTagline || 'CLOUDFLARE NATIVE • FOX3'}
                  onChange={e => updateSystemSettings({ headerTagline: e.target.value })}
                  placeholder="例如：数字资产管理与同步平台"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-500" />
                  <span>全站时区设定 (Timezone)</span>
                </label>
                <select
                  value={systemSettings.timezone || 'Asia/Shanghai'}
                  onChange={e => updateSystemSettings({ timezone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {timezoneOptions.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. 深度定制与全站怀旧/风格主题中心 (16 款独立风格主题) */}
            <div>
              <button type="button" aria-expanded={!collapsedSections.themeCenter} onClick={() => toggleSection('themeCenter')} className="w-full flex items-center justify-between mb-2 rounded-xl p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="block text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Palette className="w-4 h-4 text-sky-500" />2. 时尚与设计风格主题中心 (16 款)</span>
                {collapsedSections.themeCenter ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
              </button>
              {!collapsedSections.themeCenter && <>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-sky-500" />
                  <span>2. 时尚与设计风格主题中心 (已内置 16 款独立风格主题)</span>
                </label>
                <span className="text-[11px] text-slate-400">深度重塑界面边框、质感、阴影与系统气质</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                {aestheticThemes.map(theme => {
                  const isCurrent = themeMode === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        setThemeMode(theme.id);
                        updateSystemSettings({
                          themeColor: theme.color,
                          customPaletteBg: theme.bg,
                        });
                      }}
                      className={`flex flex-col justify-between p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                        isCurrent
                          ? 'border-sky-500 ring-2 ring-sky-500/30 bg-sky-50/80 dark:bg-sky-950/50 shadow-md scale-[1.01]'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{theme.icon}</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {theme.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full shadow-inner border border-black/10"
                            style={{ backgroundColor: theme.color }}
                            title="主色"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full shadow-inner border border-black/10"
                            style={{ backgroundColor: theme.bg }}
                            title="背景底色"
                          />
                          {isCurrent && <Check className="w-4 h-4 text-sky-500 shrink-0 ml-1" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {theme.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
              </>}
            </div>

            {/* 3. 自定义背景调色板 & 半透明毛玻璃透光开关 */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    3. {t('settings.bgColor')} (主色调)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={systemSettings.themeColor}
                      onChange={e => updateSystemSettings({ themeColor: e.target.value })}
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      value={systemSettings.themeColor}
                      onChange={e => updateSystemSettings({ themeColor: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('settings.bgColor')} (背景底色)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={systemSettings.customPaletteBg || '#f8fafc'}
                      onChange={e => updateSystemSettings({ customPaletteBg: e.target.value })}
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      value={systemSettings.customPaletteBg || '#f8fafc'}
                      onChange={e => updateSystemSettings({ customPaletteBg: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Transparent Card Toggle */}
              <div className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                    卡片透明透光模式 (毛玻璃透出全站背景照片)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    开启后全站各功能卡片将转为优雅半透明质感，全景呈现全站背景照片。
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={systemSettings.transparentCards}
                  onChange={e => updateSystemSettings({ transparentCards: e.target.checked })}
                  className="w-5 h-5 text-sky-500 rounded cursor-pointer"
                />
              </div>

              {/* Bottom Buttons Master Switch */}
            </div>

            {/* 4. 自定义头像 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                4. {t('settings.avatar')} (本地图片上传即时生效)
              </label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <SafeImage
                    src={systemSettings.avatarUrl || '/images/hero-default.jpg'}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition"
                >
                  上传本地头像
                </button>
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarUpload}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="text"
                  value={systemSettings.avatarUrl || ''}
                  onChange={e => updateSystemSettings({ avatarUrl: e.target.value })}
                  placeholder="或粘贴网络头像 URL"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>

            {/* 5. 全站背景照片 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                5. {t('settings.siteBg')} (本地图片上传设定)
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fullBgInputRef.current?.click()}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition"
                >
                  上传全站背景图
                </button>
                <input
                  type="file"
                  ref={fullBgInputRef}
                  onChange={handleFullBgUpload}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="text"
                  value={systemSettings.fullBackgroundUrl || ''}
                  onChange={e => updateSystemSettings({ fullBackgroundUrl: e.target.value })}
                  placeholder="或粘贴全站背景 URL (开启卡片透明后透光呈现)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                {systemSettings.fullBackgroundUrl && (
                  <button
                    onClick={() => updateSystemSettings({ fullBackgroundUrl: '' })}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    清除背景
                  </button>
                )}
              </div>
            </div>

            {/* 6. 首页介绍区照片 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                6. {t('settings.heroBg')} (仅首页介绍区)
              </label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <SafeImage
                    src={systemSettings.heroIntroImage || '/images/hero-default.jpg'}
                    alt="Hero Intro"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => heroBgInputRef.current?.click()}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition"
                >
                  更换首页介绍区照片
                </button>
                <input
                  type="file"
                  ref={heroBgInputRef}
                  onChange={handleHeroBgUpload}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="text"
                  value={systemSettings.heroIntroImage || ''}
                  onChange={e => updateSystemSettings({ heroIntroImage: e.target.value })}
                  placeholder="或粘贴介绍区图片 URL"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: 网站隐私与邮箱注册开关 */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-all duration-300 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div
          onClick={() => toggleSection('privacy')}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-sky-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              全站隐私与注册设置
            </h3>
          </div>
          {collapsedSections.privacy ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {!collapsedSections.privacy && (
          <div className="p-6 space-y-6">
            {/* 3 Privacy Switches */}
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    全站隐私开关 (未注册访客仅看博客)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    开启后，未登录的外部访客仅能浏览博客文章，网盘、书架、影音、相册、AI编程等分区将严格对游客隐藏。
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={systemSettings.hideNonBlogForGuests}
                  onChange={e => updateSystemSettings({ hideNonBlogForGuests: e.target.checked })}
                  className="w-5 h-5 text-sky-500 rounded focus:ring-sky-500 shrink-0 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">普通用户管理自己的照片、视频和电子书</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">开启后，已登录普通用户可上传内容，并编辑/删除标记为本人所有的内容；管理员始终可管理全部内容。当前所有权标记在前端维护，不构成后端安全边界。</p>
                </div>
                <input type="checkbox" checked={Boolean(systemSettings.allowUserMediaManagement)} onChange={e => updateSystemSettings({ allowUserMediaManagement: e.target.checked })} className="w-5 h-5 text-sky-500 rounded focus:ring-sky-500 shrink-0 cursor-pointer" />
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">向非管理员开放「网站与图床中心」浏览权限</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">默认关闭仅管理员可见；打开后非管理员（注册用户及未开启隐私锁时的访客）均可进入网站与图床中心浏览与导出书签（新增/删除与导入仍仅限管理员）。</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(systemSettings.allowPublicSitesAccess)}
                  onChange={e => updateSystemSettings({ allowPublicSitesAccess: e.target.checked })}
                  className="w-5 h-5 text-sky-500 rounded focus:ring-sky-500 shrink-0 cursor-pointer"
                />
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    仅限邮箱注册 (强制邮箱身份验证)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    开启后普通账号注册通道将关闭，新用户注册必须提供有效邮箱地址。
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={systemSettings.emailRegistrationOnly}
                  onChange={e => updateSystemSettings({ emailRegistrationOnly: e.target.checked })}
                  className="w-5 h-5 text-sky-500 rounded focus:ring-sky-500 shrink-0 cursor-pointer"
                />
              </div>
            </div>

          </div>
        )}
      </div>

      {/* SECTION 3: 对象存储和云盘文件管理选区 (包含红绿连接状态指示灯) */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-all duration-300 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div
          onClick={() => toggleSection('storage')}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-sky-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              对象存储和云盘文件管理选区 (多存储与直连状态指示)
            </h3>
          </div>
          {collapsedSections.storage ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {!collapsedSections.storage && (
          <div className="p-6 space-y-6">
            {/* Visual Connection Status Indicators (Storage, Database, KV) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-500">
                  实时连通探测（R2 列表、D1 查询、KV 读取及已配置 COS/OSS Bucket）
                </h4>
                <button
                  type="button"
                  onClick={() => refreshChannelStatus()}
                  className="flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>刷新连通状态</span>
                </button>
              </div>

              <div className={`grid gap-3 ${deviceMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
                {/* Storage Bucket Light */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Cloudflare R2 存储桶</span>
                    <span className="text-[10px] text-slate-400">灯亮表示 bucket.list 探测成功</span>
                  </div>
                  {cloudServicesStatus.r2 ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      探测成功 (R2)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      探测失败 / 未绑定
                    </span>
                  )}
                </div>

                {/* Database Light */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Cloudflare D1 数据库</span>
                    <span className="text-[10px] text-slate-400">灯亮表示 SELECT 1 查询成功</span>
                  </div>
                  {cloudServicesStatus.d1 ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      查询成功 (D1)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      探测失败 / 未绑定
                    </span>
                  )}
                </div>

                {/* KV Light */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Cloudflare Workers KV</span>
                    <span className="text-[10px] text-slate-400">仅做 KV get 读取探测，不代表写入配额可用</span>
                  </div>
                  {cloudServicesStatus.kv ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      读取成功 (KV)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      探测失败 / 未绑定
                    </span>
                  )}
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">COS / OSS / S3-compatible</span>
                    <span className="text-[10px] text-slate-400">Pages Functions 的只读 Bucket 探测</span>
                  </div>
                  {cloudServicesStatus.objectStorage ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {cloudServicesStatus.objectStorageProvider?.toUpperCase()} 已连通
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      未配置 / 探测失败
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Capacity meters from server-side object enumeration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">容量占用概览</span>
                <button
                  type="button"
                  onClick={() => void refreshStorage()}
                  disabled={storageLoading}
                  className="flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50"
                >
                  <RotateCw className={`w-3 h-3 ${storageLoading ? 'animate-spin' : ''}`} />
                  <span>{storageLoading ? '正在统计…' : '刷新用量统计'}</span>
                </button>
              </div>
              <div className={`grid gap-4 ${deviceMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-400 block mb-1">对象存储当前实际用量</span>
                  <span className="text-2xl font-bold font-mono text-sky-500">
                    {storageUsage ? `${(storageUsage.r2Bytes / (1024 * 1024)).toFixed(2)} MB` : '尚未统计'}
                  </span>
                  <span className="text-xs text-slate-400 block mt-1">
                    {storageUsage ? `${storageUsage.r2Files.toLocaleString()} 个对象${storageUsage.exact ? ' · 已全量枚举' : ' · 统计未完成'}` : '请点击刷新用量统计'}
                  </span>
                  {storageUsage?.note && <span className="mt-1 block text-[10px] text-slate-400">{storageUsage.note}</span>}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-400 block mb-1">数据库回退文件（单独列示，不重复相加）</span>
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-1">
                    <HardDrive className="w-4 h-4" /> {storageUsage ? `${(storageUsage.d1FallbackBytes / (1024 * 1024)).toFixed(2)} MB · ${storageUsage.d1FallbackFiles} 个文件` : '尚未统计'}
                  </span>
                  <span className="text-xs text-slate-400 block mt-1">
                    统计基于真实对象列举，不虚构固定配额；外部存储和浏览器本地缓存未计入。
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/30 space-y-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="font-bold text-sky-800 dark:text-sky-200">
                Cloudflare Pages 仪表板绑定指南（D1 数据库 / R2 存储桶 / KV 命名空间）
              </div>
              <p>
                1. 本项目已移除仓库根目录会锁定控制台绑定的 <code className="font-mono">wrangler.toml</code>（改用 <code className="font-mono">wrangler.example.toml</code> 作为本地 CLI 参考），因此可在 Cloudflare Dashboard → <b>Pages 项目 → Settings → Bindings</b> 自由添加或修改资源绑定。
              </p>
              <p>
                2. 推荐绑定变量名：D1 数据库填 <code className="font-mono font-semibold">DB</code>，R2 存储桶填 <code className="font-mono font-semibold">R2_BUCKET</code>，KV 命名空间填 <code className="font-mono font-semibold">KV</code>（服务端也支持常见别名与自动类型识别）。绑定完成后，请触发一次<b>重新部署（Retry deployment / Direct Upload）</b>使最新环境注入 Functions。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 5: 站内密码修改与管理员唯一性保护 */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-all duration-300 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div
          onClick={() => toggleSection('password')}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-sky-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              站内密码修改与管理员权限安全
            </h3>
          </div>
          {collapsedSections.password ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {!collapsedSections.password && (
          <form onSubmit={handleChangePassword} className="p-6 space-y-4 max-w-md">
            {passwordMsg && (
              <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 rounded-xl text-xs text-sky-700 dark:text-sky-300">
                {passwordMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                管理员用户名（本机开发偏好；生产环境由 Cloudflare ADMIN_USERNAME 决定）
              </label>
              <input
                type="text"
                value={customAdminName}
                onChange={e => setCustomAdminName(e.target.value)}
                placeholder="fox"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                当前密码
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder={adminPassword ? '输入当前使用的密码' : '首次设置时可留空'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100"
                required={Boolean(adminPassword)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              本机开发管理员密码（至少 6 个字符；可使用数字或任意字符；生产环境在 Pages Secret 设置 ADMIN_PASSWORD）
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="设置新密码（至少 6 个字符；仅 localhost 有效）"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                确认新密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100"
                required
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-md transition"
            >
              更新本机管理员密码
            </button>
          </form>
        )}
      </div>

      <SiteOwnerChat open={!collapsedSections.ownerChat} onToggle={() => toggleSection('ownerChat')} />
      {/* SECTION 6: 设置器底部日历与在线翻译工具组件 */}
      <div className={`p-6 rounded-3xl border shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        {/* Interactive Calendar Widget */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-sky-500" />
              <span>智能实时日历 ({systemSettings.timezone || 'Asia/Shanghai'})</span>
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </span>
              <button
                type="button"
                onClick={() => toggleSection('calendar')}
                aria-expanded={!collapsedSections.calendar}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span>{collapsedSections.calendar ? tx('展开') : tx('收拢')}</span>
                {collapsedSections.calendar ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {!collapsedSections.calendar && <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
            {/* Simple Elegant Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
              <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {Array.from({ length: 35 }).map((_, i) => {
                const dayNum = i - 2; // Offset for demo month layout
                const isToday = dayNum === new Date().getDate();
                const isValidDay = dayNum > 0 && dayNum <= 31;
                return (
                  <div
                    key={i}
                    className={`py-2 rounded-xl transition ${
                      isToday
                        ? 'bg-sky-500 text-white font-bold shadow-md'
                        : isValidDay
                        ? 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        : 'text-slate-300 dark:text-slate-600'
                    }`}
                  >
                    {isValidDay ? dayNum : ''}
                  </div>
                );
              })}
            </div>
          </div>}
        </div>

        {/* Online Translation Widget */}
        <div className="space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-emerald-500" />
              <span>快速在线互译助手</span>
            </h4>
            <div className="flex items-center gap-2 text-[11px]">
              {!collapsedSections.translate && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowApiSettings(!showApiSettings)}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>⚙️ API 配置</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <select
                      value={translateSource}
                      onChange={e => setTranslateSource(e.target.value)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    >
                      <option value="zh">中文</option>
                      <option value="en">English</option>
                    </select>
                    <span>➔</span>
                    <select
                      value={translateTarget}
                      onChange={e => setTranslateTarget(e.target.value)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    >
                      <option value="en">English</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => toggleSection('translate')}
                aria-expanded={!collapsedSections.translate}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span>{collapsedSections.translate ? tx('展开') : tx('收拢')}</span>
                {collapsedSections.translate ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {!collapsedSections.translate && <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 flex-1 flex flex-col">
            {/* API Settings Panel (Foldable) */}
            {showApiSettings && (
              <div className="p-3.5 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    外部通用翻译 API 配置
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={translateDraft.engine === 'free'}
                        onChange={() => setTranslateDraft(prev => ({ ...prev, engine: 'free' }))}
                      />
                      <span>免费高可用通道</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        checked={translateDraft.engine === 'custom'}
                        onChange={() => setTranslateDraft(prev => ({ ...prev, engine: 'custom' }))}
                      />
                      <span>自定义翻译 API (DeepL/OpenAI/自建)</span>
                    </label>
                  </div>
                </div>

                {translateDraft.engine === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">
                        翻译接口 URL (POST 请求)
                      </span>
                      <input
                        type="text"
                        value={translateDraft.apiUrl}
                        placeholder="https://api.deepl.com/v2/translate 或 https://api.openai.com/v1/chat/completions"
                        onChange={e => setTranslateDraft(prev => ({ ...prev, apiUrl: e.target.value }))}
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">
                        API Key (身份凭证密钥)
                      </span>
                      <input
                        type="password"
                        value={translateDraft.apiKey}
                        placeholder="Bearer token 或 sk-..."
                        onChange={e => setTranslateDraft(prev => ({ ...prev, apiKey: e.target.value }))}
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px]"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400">
                    支持标准 JSON 格式与通用翻译代理，保存后站内即刻生效
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveTranslateConfig}
                    className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isTranslateSaved ? '已保存！' : '保存外部翻译 API 配置'}</span>
                  </button>
                </div>
              </div>
            )}

            <textarea
              rows={5}
              value={sourceText}
              onChange={e => setSourceText(e.target.value)}
              placeholder="在此输入需要快速翻译的文字..."
              className="w-full min-h-[22vh] md:min-h-24 px-3 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            />
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">
                {translateConfig.engine === 'custom' ? '已挂载自定义翻译 API' : '实时公共在线与词库互译通道'}
              </span>
              <button
                type="button"
                onClick={handleQuickTranslate}
                disabled={isTranslating}
                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                {isTranslating ? '正在翻译...' : '立即翻译'}
              </button>
            </div>
            {translatedText && (
              <div className="p-3 min-h-[18vh] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 font-mono whitespace-pre-wrap break-words">
                {translatedText}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* SECTION 7: 上传并应用主题 JSON */}
      <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 p-5 space-y-3`}>
        <h3 className="text-sm font-bold">{tx('上传并应用主题 JSON')}</h3><p className="text-xs text-slate-500">{tx('导入主题文件后会应用颜色、背景与卡片透明度，并随设置同步。')}</p>
        <input aria-label={tx('选择主题 JSON 文件')} type="file" accept="application/json,.json" className="block w-full text-xs" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>128*1024)throw new Error('主题文件不能超过 128 KiB');const theme=JSON.parse(await file.text());if(!/^#[0-9a-f]{6}$/i.test(theme.themeColor||'')||!/^#[0-9a-f]{6}$/i.test(theme.background||''))throw new Error('主题 JSON 必须包含 themeColor 和 background 两个 #RRGGBB 颜色');updateSystemSettings({themeColor:theme.themeColor,customPaletteBg:theme.background,transparentCards:Boolean(theme.transparentCards),uploadedThemeName:String(theme.name||file.name).slice(0,80)});showToast(tx('主题已导入并保存'),'success');}catch(error:any){showToast(error.message||tx('主题导入失败'),'error');}e.currentTarget.value='';}}/>
        <button type="button" onClick={()=>toggleSection('themeHelp')} aria-expanded={!collapsedSections.themeHelp} className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left text-xs font-semibold dark:bg-slate-800">{tx('主题制作与使用说明')} {collapsedSections.themeHelp?<ChevronDown className="h-4 w-4"/>:<ChevronUp className="h-4 w-4"/>}</button>
        {!collapsedSections.themeHelp&&<div className="rounded-xl border border-slate-200 p-4 text-xs leading-relaxed dark:border-slate-700"><p>{tx('制作 UTF-8 JSON 文件，顶层填写 name、themeColor、background、transparentCards。颜色使用六位十六进制，例如 #2563EB。')}</p><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-emerald-200">{`{\n  "name": "我的主题",\n  "themeColor": "#2563EB",\n  "background": "#F1F5F9",\n  "transparentCards": true\n}`}</pre><p className="mt-2">{tx('选择 JSON 后立即应用；保存的主题设置会与站点内容一起写入 D1。此导入器不会执行 CSS 或脚本，主题安全地使用颜色与透明度选项。')}</p></div>}
      </section>

      {/* SECTION 8: 全站字体切换与本地字体上传 */}
      <section className={`rounded-3xl border shadow-sm p-5 space-y-4 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5 text-sky-500" />
            <h3 className="text-sm font-bold">{tx('全站字体切换与本地字体上传')}</h3>
          </div>
          <span className="text-[11px] text-slate-500">
            {tx('支持楷书、幼圆、秦篆及本地字体文件 (.ttf / .otf / .woff / .woff2) 立即生效')}
          </span>
        </div>

        <button type="button" onClick={() => toggleSection('font')} aria-expanded={!collapsedSections.font} className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold">{tx('字体选项与上传')}{collapsedSections.font ? <ChevronDown className="w-4 h-4"/> : <ChevronUp className="w-4 h-4"/>}</button>
        {!collapsedSections.font && <>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {[
            { id: 'default', label: '系统默认', desc: '现代无衬线标准体' },
            { id: 'kaiti', label: '楷书', desc: 'KaiTi / 标楷手写韵味' },
            { id: 'youyuan', label: '幼圆', desc: 'YouYuan / 圆润亲和' },
            { id: 'qinzhuanshu', label: '秦篆', desc: '古拙小篆书风（可配本地字体）' },
            ...(systemSettings.customFontName
              ? [{ id: 'custom', label: '已上传字体', desc: systemSettings.customFontName }]
              : []),
          ].map(opt => {
            const active = (systemSettings.fontFamily || 'default') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateSystemSettings({ fontFamily: opt.id as any })}
                className={`rounded-2xl border p-3 text-left transition ${
                  active
                    ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold">{tx(opt.label)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                本地字体文件上传切换
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                上传您喜欢的楷书、幼圆、秦篆（如方正小篆体 .ttf / .otf / .woff2）文件，将保存于本机并尝试同步至云端文件库。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer shadow-xs transition">
                <Upload className="w-3.5 h-3.5" />
                <span>选择本地字体上传</span>
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,.ttc,font/ttf,font/otf,font/woff,font/woff2"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 25 * 1024 * 1024) {
                        throw new Error('字体文件不能超过 25 MB');
                      }
                      await saveFileToIndexedDB('idb_file_fox3_custom_font', file);
                      let remoteUrl = '';
                      try {
                        const res = await uploadFile(file);
                        if (res?.url && !res.url.startsWith('idb_file_')) {
                          remoteUrl = res.url;
                        }
                      } catch {}
                      updateSystemSettings({
                        fontFamily: 'custom',
                        customFontName: file.name,
                        customFontUrl: remoteUrl,
                      });
                      showToast(`已切换为本地上传字体：${file.name}`, 'success');
                    } catch (err: any) {
                      showToast(err?.message || '字体加载失败', 'error');
                    }
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {systemSettings.customFontName && (
                <button
                  type="button"
                  onClick={async () => {
                    await saveFileToIndexedDB('idb_file_fox3_custom_font', '');
                    updateSystemSettings({
                      fontFamily: 'default',
                      customFontName: '',
                      customFontUrl: '',
                    });
                    showToast('已恢复默认字体设置', 'info');
                  }}
                  className="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium dark:border-rose-900 dark:hover:bg-rose-950/30"
                >
                  清除自定义字体
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 space-y-1">
            <div className="text-[10px] text-slate-400">当前全站字体即时预览效果：</div>
            <p className="text-base sm:text-lg font-medium text-slate-800 dark:text-slate-100 leading-relaxed">
              天地玄黄，宇宙洪荒。楷书端正，幼圆清秀，秦篆古朴。fox3 Blog Typography 123456
            </p>
          </div>
        </div>
        </>}
      </section>
    </div>
  );
};
