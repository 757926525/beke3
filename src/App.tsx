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
import { ArrowUp, Sparkles, Compass } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { systemSettings, currentUser, deviceMode, darkMode, themeMode, t, locale } = useApp();
  const [currentTab, setCurrentTab] = useState<string>('blog');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  const isAdmin = currentUser?.role === 'admin';
  const isGuestRestricted = !currentUser && systemSettings.hideNonBlogForGuests;

  const canAccessSites = isAdmin || (Boolean(systemSettings.allowPublicSitesAccess) && !isGuestRestricted);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('paymentOrder') || params.has('paymentCancel')) setCurrentTab('shop');
  }, []);

  // Keep admin controls protected; signed-in users may open Settings for the owner-chat panel only.
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

  // Container styling based on deviceMode (responsive vs mobile simulation)
  const getContainerClasses = () => {
    if (deviceMode === 'mobile') {
      return 'max-w-[420px] w-full mx-auto my-6 px-3 py-4 shadow-2xl rounded-[40px] overflow-hidden border-[10px] border-slate-800 bg-slate-50 dark:bg-slate-900 min-h-[844px] transition-all duration-300 flex flex-col';
    }
    return 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full';
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 relative flex flex-col justify-between theme-${themeMode}`}
      style={{
        backgroundColor: systemSettings.customPaletteBg || '#f8fafc',
        backgroundImage: systemSettings.fullBackgroundUrl
          ? `url(${systemSettings.fullBackgroundUrl})`
          : undefined,
        backgroundSize: systemSettings.fullBackgroundUrl ? 'cover' : undefined,
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Global Background overlay if custom background photo is provided */}
      {systemSettings.fullBackgroundUrl && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] pointer-events-none z-0" />
      )}

      <div className="relative z-10 flex flex-col flex-1">
        {/* Navigation Header */}
        <Header
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onOpenAuth={() => setIsAuthOpen(true)}
        />

        {/* Main Content Area */}
        <main className={`flex-1 ${getContainerClasses()}`}>
          {/* Hero Section shown on standard blog */}
          {currentTab === 'blog' && <HeroIntro />}

          {/* Tab Views */}
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
            <div className="space-y-6">
              <SettingsSection />
            </div>
          )}
          {currentTab === 'settings' && currentUser?.role === 'user' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">{translateInline(locale, '设置区中的站长沟通')}</h2>
              <SiteOwnerChat />
            </div>
          )}
          {currentTab === 'guide' && <GuideSection />}
        </main>

        {/* Global Footer */}
        <footer className="relative z-10 border-t py-6 text-center text-xs border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md text-slate-500 dark:text-slate-400">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left sm:text-left">
              <span>&copy; {new Date().getFullYear()} <b>{systemSettings.siteName}</b> (fox3). All rights reserved.</span>
              <span className="text-[11px] text-amber-600/90 dark:text-amber-400/90">
                {systemSettings.allowPublicSitesAccess
                  ? '(系统权限说明：备份区、邮箱中枢、系统设置仅管理员可见；网站图床中心已开启公开浏览)'
                  : '(系统权限说明：备份区、邮箱中枢、系统设置、网站图床专区仅管理员可见)'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] shrink-0">
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
