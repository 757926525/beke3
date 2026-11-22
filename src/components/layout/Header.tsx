import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BookOpen,
  Image,
  Film,
  ShoppingBag,
  Mail,
  Settings,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  LogOut,
  LogIn,
  ShieldAlert,
  RotateCw,
  Bookmark,
  Cloud,
  Globe,
  Bell,
} from 'lucide-react';
import { SafeImage } from '../common/SafeImage';
import { getAdminSessionToken } from '../../utils/adminSession';
import { getUserSessionToken } from '../../utils/userSession';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  onOpenAuth,
}) => {
  const {
    currentUser,
    logout,
    systemSettings,
    syncState,
    triggerManualSync,
    locale,
    setLocale,
    t,
    channelConnected,
  } = useApp();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadTarget, setUnreadTarget] = useState<{ target: 'orders' | 'chat'; refId?: string }>({ target: 'chat' });

  const isAdmin = currentUser?.role === 'admin';
  const isGuestRestricted = !currentUser && systemSettings.hideNonBlogForGuests;

  const navItems = [
    { id: 'blog', label: t('nav.blog'), icon: BookOpen },
    { id: 'bookmarks', label: t('nav.bookmarks'), icon: Bookmark },
    { id: 'sites', label: t('nav.sites') || '网站图床', icon: Globe },
    { id: 'books', label: t('nav.books'), icon: BookOpen, restricted: true },
    { id: 'gallery', label: t('nav.gallery'), icon: Image, restricted: true },
    { id: 'media', label: t('nav.media'), icon: Film, restricted: true },
    { id: 'shop', label: t('nav.shop'), icon: ShoppingBag },
    { id: 'backup', label: '备份区', icon: Cloud, adminOnly: true },
    { id: 'mail', label: t('nav.mail'), icon: Mail, adminOnly: true },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
    { id: 'guide', label: t('nav.guide'), icon: HelpCircle },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    if (item.id === 'sites' && !isAdmin && (!systemSettings.allowPublicSitesAccess || isGuestRestricted)) {
      return false;
    }
    if (item.id === 'settings' && !currentUser) {
      return false;
    }
    if (item.restricted && isGuestRestricted) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }
    let active = true;
    const refreshUnread = async () => {
      const token = isAdmin ? getAdminSessionToken() : getUserSessionToken();
      if (!token) return;
      try {
        const response = await fetch('/api/notifications/unread', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const result = await response.json();
        if (active && response.ok && result.success) {
          setUnreadCount(Math.max(0, Number(result.count) || 0));
          setUnreadTarget({ target: result.target === 'orders' ? 'orders' : 'chat', refId: String(result.refId || '') });
        }
      } catch {
        if (active) setUnreadCount(0);
      }
    };
    void refreshUnread();
    const timer = window.setInterval(refreshUnread, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [currentUser?.id, isAdmin]);

  return (
    <>
      <header className="sticky top-0 z-40 w-full max-w-full overflow-x-clip transition-colors duration-200 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-14 sm:h-16 min-w-0">
            {/* Brand */}
            <div className="flex items-center gap-2.5 cursor-pointer min-w-0 shrink" onClick={() => setCurrentTab('blog')}>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-sky-500/30 shadow-sm shrink-0">
                <SafeImage
                  src={systemSettings.avatarUrl || '/images/hero-default.jpg'}
                  alt={systemSettings.siteName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-sky-500 via-indigo-500 to-rose-500 bg-clip-text text-transparent leading-none block truncate">
                  {systemSettings.siteName}
                </span>
                <span className="hidden sm:block text-[10px] font-mono tracking-wider uppercase text-slate-400 mt-1 truncate">
                  {systemSettings.headerTagline || 'CLOUDFLARE NATIVE • FOX3'}
                </span>
              </div>
            </div>

            {/* Desktop Navigation Items */}
            {!isCollapsed && (
              <nav className="hidden md:flex items-center gap-1 overflow-x-auto py-1 min-w-0">
                {filteredNavItems.map(item => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentTab(item.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        isActive
                          ? 'bg-sky-500 text-white font-semibold shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Right Controls */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                onClick={() => triggerManualSync()}
                disabled={syncState.isSyncing}
                title={`${syncState.message} (${t('common.refresh')})`}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-lg border transition border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[36px]"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    syncState.isSyncing
                      ? 'bg-amber-400 animate-ping'
                      : syncState.status === 'synced'
                        ? 'bg-emerald-500'
                        : syncState.status === 'error' ? 'bg-rose-500' : 'bg-slate-400'
                  }`}
                />
                <RotateCw className={`w-3 h-3 shrink-0 ${syncState.isSyncing ? 'animate-spin text-amber-500' : syncState.status === 'synced' ? 'text-emerald-500' : syncState.status === 'error' ? 'text-rose-400' : 'text-slate-500'}`} />
                <span className="hidden xl:inline text-[10px] whitespace-nowrap">
                  {syncState.isSyncing ? t('common.syncing') : t('common.refresh')}
                </span>
              </button>

              <label className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 min-h-[36px]" title={`切换语言 (当前: ${locale})`}>
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <select aria-label="界面语言" value={locale} onChange={event => setLocale(event.target.value as typeof locale)} className="max-w-[74px] sm:max-w-[92px] bg-transparent text-[10px] uppercase font-mono focus:outline-none">
                  <option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option>
                </select>
              </label>

              {currentUser && (
                <button
                  onClick={() => {
                    setCurrentTab('shop');
                    try {
                      if (unreadTarget.target === 'orders') window.sessionStorage.setItem('fox3-open-orders', '1');
                      else {
                        window.sessionStorage.setItem('fox3-open-messages', '1');
                        if (unreadTarget.refId) window.sessionStorage.setItem('fox3-open-chat-id', unreadTarget.refId);
                      }
                    } catch {}
                    window.dispatchEvent(new Event(unreadTarget.target === 'orders' ? 'fox3-open-orders' : 'fox3-open-messages'));
                    const token = isAdmin ? getAdminSessionToken() : getUserSessionToken();
                    if (token) void fetch('/api/notifications/read', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                  }}
                  title={unreadCount ? `有 ${unreadCount} 条未读消息，打开${unreadTarget.target === 'orders' ? '订单管理' : '对应客服对话'}` : '打开商城与站内对话'}
                  aria-label={unreadCount ? `${unreadCount} 条未读站内消息` : '站内消息'}
                  className="relative p-2 rounded-lg text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </button>
              )}

              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? t('header.expand') : t('header.collapse')}
                className="p-2 rounded-lg transition text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>

              {currentUser ? (
                <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
                  <span className="hidden sm:inline-block text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                    {currentUser.username} {isAdmin && <span className="text-[10px] text-sky-500 bg-sky-50 dark:bg-sky-950 px-1.5 py-0.5 rounded ml-1 font-semibold">{t('header.adminBadge')}</span>}
                  </span>
                  <button
                    onClick={logout}
                    title={t('header.logout')}
                    aria-label={t('header.logout')}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenAuth}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm transition bg-sky-500 hover:bg-sky-600 text-white whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('header.login')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Non-sticky Quick Section Strip so sticky height stays well within mobile cap and mobile has no sidebar */}
      {!isCollapsed && (
        <div className="w-full max-w-full border-b border-slate-200/70 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2 overflow-x-auto touch-pan-x no-scrollbar">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider mr-1 text-slate-400 dark:text-slate-500">
                {t('header.quickJump')}:
              </span>
              {filteredNavItems.map(item => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={`sub-${item.id}`}
                    onClick={() => setCurrentTab(item.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors min-h-[36px] ${
                      isActive
                        ? 'bg-sky-500 text-white shadow-sm font-semibold'
                        : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="hidden lg:flex items-center gap-2 shrink-0 text-[11px] text-slate-400">
              <span>{t('header.channelStatus')}:</span>
              <span className={`inline-flex items-center gap-1 font-medium ${
                channelConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  channelConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`} />
                {channelConnected ? t('header.channelOnline') : t('header.channelOffline')}
              </span>
            </div>
          </div>

          {isGuestRestricted && (
            <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200/50 dark:border-amber-900/50 text-[11px] text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('privacy.guestNotice')}</span>
              </span>
              <button
                onClick={onOpenAuth}
                className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-100 whitespace-nowrap shrink-0"
              >
                {t('privacy.loginNow')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};
