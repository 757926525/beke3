import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { HeroIntro } from './components/blog/HeroIntro';
import { BlogSection } from './components/blog/BlogSection';
import { BookmarksSection } from './components/bookmarks/BookmarksSection';
import { BookshelfSection } from './components/books/BookshelfSection';
import { GallerySection } from './components/gallery/GallerySection';
import { MediaSection } from './components/media/MediaSection';
import { SitesSection } from './components/sites/SitesSection';
import { MailSection } from './components/mail/MailSection';
import { ShopSection } from './components/shop/ShopSection';
import { WebDavBackupSection } from './components/backup/WebDavBackupSection';
import { SettingsSection } from './components/settings/SettingsSection';
import { GuideSection } from './components/guide/GuideSection';
import { LegalPagesSection } from './components/legal/LegalPagesSection';
import { SiteOwnerChat } from './components/guide/SiteOwnerChat';
import { translateInline } from './utils/i18n';
import { AuthModal } from './components/modals/AuthModal';
import { TransferProgressBar } from './components/common/TransferProgressBar';
import { MOBILE_SKINS, getMobileSkinMeta } from './utils/mobileSkins';
import { MobileThemeMode } from './types';
import {
  BookOpen,
  Image as ImageIcon,
  ShoppingBag,
  Settings as SettingsIcon,
  HelpCircle,
  Bookmark,
  Monitor,
  Smartphone,
  Sparkles,
  LogOut,
  Check,
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const {
    systemSettings,
    updateSystemSettings,
    currentUser,
    logout,
    deviceMode,
    setDeviceMode,
    themeMode,
    locale,
    t,
  } = useApp();
  const [currentTab, setCurrentTab] = useState<string>('blog');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [showUserSkinPicker, setShowUserSkinPicker] = useState<boolean>(false);

  const isAdmin = currentUser?.role === 'admin';
  const isGuestRestricted = !currentUser && systemSettings.hideNonBlogForGuests;
  const canAccessSites = isAdmin || (Boolean(systemSettings.allowPublicSitesAccess) && !isGuestRestricted);
  const isMobileUI = deviceMode === 'mobile' || isMobileViewport;
  const activeMobileSkin = getMobileSkinMeta(systemSettings.mobileTheme);

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('paymentOrder') || params.has('paymentCancel')) setCurrentTab('shop');
  }, []);

  // Keep admin controls protected; signed-in users may open Settings for preferences & owner chat.
  useEffect(() => {
    if ((!isAdmin && ['mail', 'backup'].includes(currentTab)) || (currentTab === 'sites' && !canAccessSites) || (currentTab === 'settings' && !currentUser)) {
      setCurrentTab('blog');
    }
  }, [isAdmin, canAccessSites, currentUser, currentTab]);

  // Privacy protection: if guest and restricted, redirect to blog
  useEffect(() => {
    if (
      !currentUser &&
      systemSettings.hideNonBlogForGuests &&
      ['books', 'gallery', 'media', 'backup', 'sites'].includes(currentTab)
    ) {
      setCurrentTab('blog');
    }
  }, [currentUser, systemSettings.hideNonBlogForGuests, currentTab]);

  const getContainerClasses = () => {
    if (deviceMode === 'mobile') {
      return 'w-full max-w-full sm:max-w-[430px] mx-auto sm:my-6 px-3.5 sm:px-4 py-4 pb-20 sm:shadow-2xl sm:rounded-[38px] sm:border-[8px] sm:border-slate-800 bg-transparent min-h-[780px] transition-all duration-200 flex flex-col min-w-0 mobile-ui-wrap';
    }
    return `max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-6 w-full min-w-0 mobile-ui-wrap ${
      isMobileViewport ? 'pb-20' : ''
    }`;
  };

  const dockItems = [
    { id: 'blog', label: t('nav.blog'), icon: BookOpen },
    ...(isGuestRestricted
      ? [{ id: 'bookmarks', label: t('nav.bookmarks'), icon: Bookmark }]
      : [
          { id: 'gallery', label: t('nav.gallery'), icon: ImageIcon },
          { id: 'books', label: t('nav.books'), icon: BookOpen },
        ]),
    { id: 'shop', label: t('nav.shop'), icon: ShoppingBag },
    currentUser
      ? { id: 'settings', label: t('nav.settings'), icon: SettingsIcon }
      : { id: 'guide', label: t('nav.guide'), icon: HelpCircle },
  ];

  return (
    <div
      className={`min-h-screen w-full max-w-full overflow-x-clip transition-colors duration-200 relative flex flex-col justify-between theme-${themeMode} ${
        isMobileUI ? `is-mobile-ui mobile-skin-${activeMobileSkin.id}` : ''
      }`}
      style={{
        backgroundColor: systemSettings.customPaletteBg || '#f8fafc',
        backgroundImage: systemSettings.fullBackgroundUrl
          ? `url(${systemSettings.fullBackgroundUrl})`
          : undefined,
        backgroundSize: systemSettings.fullBackgroundUrl ? 'cover' : undefined,
        backgroundPosition: 'center',
        backgroundAttachment: isMobileUI ? 'scroll' : 'fixed',
      }}
    >
      {systemSettings.fullBackgroundUrl && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] pointer-events-none z-0" />
      )}

      <div className="relative z-10 flex flex-col flex-1 min-w-0">
        <Header
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onOpenAuth={() => setIsAuthOpen(true)}
        />

        <main className={`flex-1 ${getContainerClasses()}`}>
          {currentTab === 'blog' && <HeroIntro />}

          {currentTab === 'blog' && <BlogSection />}
          {currentTab === 'bookmarks' && <BookmarksSection />}
          {currentTab === 'sites' && canAccessSites && <SitesSection />}
          {currentTab === 'books' && <BookshelfSection />}
          {currentTab === 'gallery' && <GallerySection />}
          {currentTab === 'media' && <MediaSection />}
          {currentTab === 'shop' && <ShopSection />}
          {currentTab === 'legal' && <LegalPagesSection />}
          {currentTab === 'backup' && isAdmin && <WebDavBackupSection />}
          {currentTab === 'mail' && isAdmin && <MailSection />}
          {currentTab === 'settings' && isAdmin && (
            <div className="space-y-6 min-w-0">
              <SettingsSection />
            </div>
          )}
          {currentTab === 'settings' && currentUser?.role === 'user' && (
            <div className="space-y-4 min-w-0">
              <div className="p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                      {translateInline(locale, '账户与界面设置')}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 break-words">
                      {currentUser.username} · {translateInline(locale, '可切换视图模式、时尚手机界面或联系站长')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDeviceMode(deviceMode === 'mobile' ? 'responsive' : 'mobile')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition min-h-[40px]"
                    >
                      {deviceMode === 'mobile' ? (
                        <Smartphone className="w-4 h-4 text-sky-500" />
                      ) : (
                        <Monitor className="w-4 h-4 text-indigo-500" />
                      )}
                      <span>{deviceMode === 'mobile' ? '手机端视图' : '电脑/响应式视图'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUserSkinPicker(prev => !prev)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 text-sky-700 dark:text-sky-300 text-xs font-semibold rounded-xl transition min-h-[40px]"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>手机界面切换 · {activeMobileSkin.name}</span>
                    </button>

                    <button
                      type="button"
                      onClick={logout}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold rounded-xl shadow-xs transition min-h-[40px]"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>退出登录</span>
                    </button>
                  </div>
                </div>

                {showUserSkinPicker && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {MOBILE_SKINS.map(skin => {
                      const active = activeMobileSkin.id === skin.id;
                      return (
                        <button
                          key={skin.id}
                          type="button"
                          onClick={() => {
                            updateSystemSettings({ mobileTheme: skin.id as MobileThemeMode });
                            setDeviceMode('mobile');
                          }}
                          className={`p-3 rounded-2xl border text-left transition ${
                            active
                              ? 'border-sky-500 ring-2 ring-sky-500/30 bg-sky-50/70 dark:bg-sky-950/40'
                              : 'border-slate-200 dark:border-slate-700 hover:border-sky-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{skin.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="w-3 h-3 rounded-full border border-black/15" style={{ backgroundColor: skin.canvas }} />
                              <span className="w-3 h-3 rounded-full border border-black/15" style={{ backgroundColor: skin.accent }} />
                              {active && <Check className="w-3.5 h-3.5 text-sky-500" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{skin.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <SiteOwnerChat defaultOpen />
            </div>
          )}
          {currentTab === 'guide' && <GuideSection />}

          {deviceMode === 'mobile' && (
            <nav
              aria-label="手机端快速导航"
              className="mobile-dock sticky bottom-0 mt-auto -mx-3.5 sm:-mx-4 px-2 py-1.5 border-t border-slate-200/80 dark:border-slate-800 bg-white/92 dark:bg-slate-900/92 grid grid-cols-5 items-center z-30 safe-bottom"
            >
              {dockItems.map(item => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={`sim-dock-${item.id}`}
                    type="button"
                    data-active={active}
                    onClick={() => setCurrentTab(item.id)}
                    className={`flex flex-col items-center justify-center min-h-[44px] px-1 rounded-xl transition-colors ${
                      active ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] mt-0.5 truncate max-w-full">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </main>

        {/* Global Footer */}
        <footer className={`relative z-10 border-t py-5 text-center text-xs border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md text-slate-500 dark:text-slate-400 ${
          isMobileViewport ? 'pb-20' : ''
        }`}>
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left sm:text-left min-w-0">
              <span>&copy; {new Date().getFullYear()} <b>{systemSettings.siteName}</b> (fox3). All rights reserved.</span>
              <span className="text-[11px] text-amber-600/90 dark:text-amber-400/90 break-words">
                {systemSettings.allowPublicSitesAccess
                  ? '系统权限说明：备份区、邮箱中枢、系统设置仅管理员可见；网站图床中心已开启公开浏览'
                  : '系统权限说明：备份区、邮箱中枢、系统设置、网站图床专区仅管理员可见'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[11px] shrink-0">
              <span>依托 Cloudflare D1 + R2 原生构建</span>
              <span>•</span>
              <button onClick={() => setCurrentTab('blog')} className="hover:underline transition">首页</button>
              <button onClick={() => setCurrentTab('shop')} className="hover:underline transition">价格与商品</button>
              <button onClick={() => setCurrentTab('legal')} className="hover:underline transition">退款 / 隐私 / 服务条款 / 联系</button>
              <span>•</span>
              <button
                onClick={() => setCurrentTab('guide')}
                className="hover:underline transition text-sky-600 dark:text-sky-400 font-medium"
              >
                （说明）
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Fixed Bottom Mobile Dock on real phone viewports (<768px) */}
      {isMobileViewport && deviceMode !== 'mobile' && (
        <nav
          aria-label="手机底部导航"
          className="mobile-dock fixed bottom-0 left-0 right-0 z-40 h-14 px-2 border-t border-slate-200/80 dark:border-slate-800 bg-white/92 dark:bg-slate-900/92 grid grid-cols-5 items-center safe-bottom"
        >
          {dockItems.map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={`real-dock-${item.id}`}
                type="button"
                data-active={active}
                onClick={() => setCurrentTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] px-1 rounded-xl transition-colors ${
                  active ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] mt-0.5 truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Global Modals & Notifications */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <TransferProgressBar />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
