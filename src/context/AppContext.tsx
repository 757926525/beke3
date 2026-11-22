import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Post,
  Book,
  Photo,
  MediaItem,
  MailMessage,
  Product,
  Order,
  ChatMessage,
  SystemSettings,
  EmailSettings,
  PaymentSettings,
  WebDavConfig,
  WebDavBackupItem,
  User,
  WebSiteItem,
  ViewMode,
  GlobalThemeMode,
  DeviceViewMode,
} from '../types';
import { Locale, i18nDict, getTranslation, normalizeLocale } from '../utils/i18n';
import { clearAdminSessionToken, getAdminSessionToken } from '../utils/adminSession';
import { clearUserSessionToken, getUserSessionToken } from '../utils/userSession';
import { deleteWebDavFile, downloadWebDavFile, listWebDavFiles, testWebDav, uploadWebDavFile } from '../utils/webdav';
import {
  STORAGE_KEYS,
  loadLocalStorage,
  saveLocalStorage,
  saveFileToIndexedDB,
  getFileFromIndexedDB,
  deleteFileFromIndexedDB,
  DEFAULT_SETTINGS,
  DEFAULT_POSTS,
  DEFAULT_BOOKS,
  DEFAULT_PHOTOS,
  DEFAULT_MEDIA,
  DEFAULT_MAILS,
  DEFAULT_PRODUCTS,
  DEFAULT_ORDERS,
  DEFAULT_WEBSITES,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_WEBDAV_CONFIG,
  DEFAULT_WEBDAV_BACKUPS,
} from '../utils/storage';

interface TransferProgress {
  active: boolean;
  type: 'upload' | 'download' | 'backup' | 'restore';
  fileName: string;
  percent: number;
  speed?: string;
}

export interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: number;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  message: string;
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;

  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  books: Book[];
  setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  photos: Photo[];
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  photoFolders: Array<{ id: string; name: string; createdAt: number }>;
  setPhotoFolders: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string; createdAt: number }>>>;
  media: MediaItem[];
  setMedia: React.Dispatch<React.SetStateAction<MediaItem[]>>;
  mails: MailMessage[];
  setMails: React.Dispatch<React.SetStateAction<MailMessage[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  websites: WebSiteItem[];
  setWebsites: React.Dispatch<React.SetStateAction<WebSiteItem[]>>;

  webDavBackups: WebDavBackupItem[];
  setWebDavBackups: React.Dispatch<React.SetStateAction<WebDavBackupItem[]>>;

  systemSettings: SystemSettings;
  updateSystemSettings: (newSettings: Partial<SystemSettings>) => void;
  emailSettings: EmailSettings;
  updateEmailSettings: (newSettings: Partial<EmailSettings>) => void;
  paymentSettings: PaymentSettings;
  updatePaymentSettings: (newSettings: Partial<PaymentSettings>) => void;
  webDavConfig: WebDavConfig;
  updateWebDavConfig: (newConfig: Partial<WebDavConfig>) => void;

  transferProgress: TransferProgress;
  startTransfer: (type: TransferProgress['type'], fileName: string) => void;
  updateTransferPercent: (percent: number) => void;
  finishTransfer: () => void;
  cancelTransfer: () => void;
  webDavConnectionState: { status: 'unknown' | 'checking' | 'connected' | 'error'; checkedAt: number; message: string };
  testWebDavConnection: (config?: WebDavConfig) => Promise<boolean>;
  refreshWebDavBackups: () => Promise<void>;
  deleteWebDavBackup: (id: string) => Promise<boolean>;
  uploadWebDavRawFile: (file: File) => Promise<void>;
  downloadWebDavRawFile: (fileName: string) => Promise<Blob>;

  // Multi-transfer progress support
  multiTransferProgress: {
    active: boolean;
    type: 'upload' | 'download' | 'backup' | 'restore';
    currentFileName: string;
    currentIndex: number;
    totalCount: number;
    overallPercent: number;
    speed?: string;
  };
  startMultiTransfer: (type: 'upload' | 'download' | 'backup' | 'restore', totalCount: number, firstFileName: string) => void;
  updateMultiTransferProgress: (currentIndex: number, currentFileName: string, overallPercent: number, speed?: string) => void;
  finishMultiTransfer: () => void;

  // Unified toast notifications (success / error / info)
  toasts: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>;
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  dismissToast: (id: string) => void;

  uploadFile: (file: File) => Promise<{ url: string; size: number; name: string }>;
  deleteUploadedFiles: (
    urls: Array<string | undefined | null>,
    options?: {
      exclude?: {
        postIds?: string[];
        bookIds?: string[];
        photoIds?: string[];
        mediaIds?: string[];
        productIds?: string[];
        websiteIds?: string[];
      };
      freedBytes?: number;
      removedUserItemIds?: string[];
    }
  ) => Promise<void>;
  requestImmediateCloudSync: (removedUserItemIds?: string[]) => void;
  addStorageUsage: (bytes: number) => void;
  logout: () => void;

  deviceMode: DeviceViewMode;
  setDeviceMode: (mode: DeviceViewMode) => void;

  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  themeMode: GlobalThemeMode;
  setThemeMode: (mode: GlobalThemeMode) => void;

  // View modes for sections
  viewModes: Record<string, ViewMode>;
  setViewMode: (section: string, mode: ViewMode) => void;

  // Admin credentials management & single admin uniqueness
  adminUsername: string;
  adminPassword: string;
  updateAdminPassword: (newPass: string) => boolean;
  updateAdminUsername: (newName: string) => boolean;

  // Universal Recycle Bin (Trash)
  trashItems: Array<{
    id: string;
    originId: string;
    originType: 'post' | 'book' | 'photo' | 'media' | 'mail' | 'chat' | 'product' | 'order';
    title: string;
    preview?: string;
    deletedAt: number;
    data: any;
  }>;
  moveToTrash: (item: {
    originId: string;
    originType: 'post' | 'book' | 'photo' | 'media' | 'mail' | 'chat' | 'product' | 'order';
    title: string;
    preview?: string;
    data: any;
  }) => void;
  restoreFromTrash: (trashId: string) => void;
  permanentDeleteFromTrash: (trashId: string) => void;
  emptyTrash: () => void;

  // Real-time synchronization
  syncState: SyncState;
  triggerManualSync: () => Promise<void>;

  // NutStore backup & restore operations
  performBackup: (scope?: 'full' | 'posts' | 'books' | 'media' | 'settings') => Promise<void>;
  performRestore: (backupId: string) => Promise<boolean>;

  // Bookmark toggle
  toggleBookmark: (postId: string) => void;

  // Multi-language
  locale: Locale;
  setLocale: (loc: Locale) => void;
  t: (path: string) => string;

  // Real backend channel connectivity check
  channelConnected: boolean;
  cloudServicesStatus: { d1: boolean; r2: boolean; kv: boolean; objectStorage: boolean; objectStorageProvider: string | null };
  refreshChannelStatus: () => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const GLOBAL_THEME_MODES: GlobalThemeMode[] = [
  'modern', 'win98', 'mac-classic', 'cyberpunk', 'nordic', 'leather',
  'blueprint', 'retro', 'aurora-glass', 'neo-brutal', 'soft-pastel',
  'editorial', 'pearl-mist', 'sage-atelier', 'terracotta', 'coastal-blue', 'velvet-plum',
];
const isGlobalThemeMode = (value: unknown): value is GlobalThemeMode =>
  typeof value === 'string' && GLOBAL_THEME_MODES.includes(value as GlobalThemeMode);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The administrator password is never initialized with a universal/default credential.
  const [adminUsername, setAdminUsernameState] = useState<string>(() =>
    loadLocalStorage<string>(STORAGE_KEYS.ADMIN_USERNAME, 'fox')
  );
  const [adminPassword, setAdminPasswordState] = useState<string>(() => {
    const saved = loadLocalStorage<string>(STORAGE_KEYS.ADMIN_PASSWORD, '');
    return saved;
  });

  // Probe backend environment variable for admin config on startup
  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && data.success && data.adminUsername) {
          const fetchedAdmin = data.adminUsername.trim().toLowerCase();
          setAdminUsernameState(fetchedAdmin);
          saveLocalStorage(STORAGE_KEYS.ADMIN_USERNAME, fetchedAdmin);

          // Update current user username if currently logged in as admin
          setCurrentUser(prev => {
            if (prev && prev.role === 'admin' && prev.username !== fetchedAdmin) {
              const updated = { ...prev, username: fetchedAdmin };
              saveLocalStorage(STORAGE_KEYS.CURRENT_USER, updated);
              return updated;
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  const updateAdminPassword = (newPass: string): boolean => {
    if (!newPass || newPass.length < 6) return false;
    setAdminPasswordState(newPass);
    saveLocalStorage(STORAGE_KEYS.ADMIN_PASSWORD, newPass);
    return true;
  };

  const updateAdminUsername = (newName: string): boolean => {
    if (!newName || newName.trim().length < 2) return false;
    const sanitized = newName.trim().toLowerCase();
    setAdminUsernameState(sanitized);
    saveLocalStorage(STORAGE_KEYS.ADMIN_USERNAME, sanitized);
    try {
      const bc = new BroadcastChannel('fox3_realtime_sync');
      bc.postMessage({ type: 'SYNC_ALL', payload: { adminUsername: sanitized } });
      bc.close();
    } catch (e) {}
    return true;
  };

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = loadLocalStorage<User | null>(STORAGE_KEYS.CURRENT_USER, null);
    // Restore the admin UI across browser restarts only when a signed server token is also present.
    if (saved?.role === 'admin') {
      const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      return getAdminSessionToken() || localDevelopment ? saved : null;
    }
    return saved;
  });

  const [users, setUsers] = useState<User[]>(() =>
    loadLocalStorage<User[]>(STORAGE_KEYS.USERS, [])
  );

  useEffect(() => {
    let cancelled = false;
    const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const validateSession = async () => {
      const token = getAdminSessionToken();
      if (token) {
        try {
          const response = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
          if (response.status === 401 || response.status === 403) {
            clearAdminSessionToken();
            if (!cancelled) setCurrentUser(prev => prev?.role === 'admin' ? null : prev);
          } else if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) {
            const data = await response.json();
            if (data?.authenticated && data?.user?.role === 'admin' && !cancelled) setCurrentUser(data.user as User);
          }
        } catch {
          // Keep the signed token on network failures; protected endpoints will revalidate it.
        }
      } else if (!localDevelopment) {
        setCurrentUser(prev => prev?.role === 'admin' ? null : prev);
      }
      const userToken = getUserSessionToken();
      if (userToken) {
        try {
          const response = await fetch('/api/auth/user-session', { headers: { Authorization: `Bearer ${userToken}`, Accept: 'application/json' } });
          if (response.status === 401 || response.status === 403) {
            clearUserSessionToken();
            if (!cancelled) setCurrentUser(prev => prev?.role === 'user' ? null : prev);
          } else if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) {
            const data = await response.json();
            if (data?.authenticated && data?.user?.role === 'user' && !cancelled) setCurrentUser(data.user as User);
          }
        } catch {
          // Preserve the signed user token on transient network errors.
        }
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void validateSession(); };
    const onOnline = () => { void validateSession(); };
    void validateSession();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const [posts, setPosts] = useState<Post[]>(() =>
    loadLocalStorage<Post[]>(STORAGE_KEYS.POSTS, DEFAULT_POSTS)
  );

  const [books, setBooks] = useState<Book[]>(() =>
    loadLocalStorage<Book[]>(STORAGE_KEYS.BOOKS, DEFAULT_BOOKS)
  );

  const [photos, setPhotos] = useState<Photo[]>(() =>
    loadLocalStorage<Photo[]>(STORAGE_KEYS.PHOTOS, DEFAULT_PHOTOS)
  );

  const [photoFolders, setPhotoFolders] = useState<Array<{ id: string; name: string; createdAt: number }>>(() => loadLocalStorage('fox3_photo_folders', [
      { id: 'folder-landscape', name: '自然风光', createdAt: Date.now() - 86400000 * 10 },
      { id: 'folder-cyberpunk', name: '赛博都市', createdAt: Date.now() - 86400000 * 9 },
      { id: 'folder-daily', name: '日常记录', createdAt: Date.now() - 86400000 * 8 },
    ]));

  const [media, setMedia] = useState<MediaItem[]>(() =>
    loadLocalStorage<MediaItem[]>(STORAGE_KEYS.MEDIA, DEFAULT_MEDIA)
  );

  const [mails, setMails] = useState<MailMessage[]>(() =>
    loadLocalStorage<MailMessage[]>(STORAGE_KEYS.MAILS, DEFAULT_MAILS)
  );

  const [products, setProducts] = useState<Product[]>(() =>
    loadLocalStorage<Product[]>(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS)
  );

  const [orders, setOrders] = useState<Order[]>(() =>
    loadLocalStorage<Order[]>(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS)
  );

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    loadLocalStorage<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, [
      {
        id: 'msg-init-1',
        sender: 'customer',
        userName: '访客-9527',
        message: '您好！请问定制交付包含 Cloudflare D1 配置吗？',
        createdAt: Date.now() - 3600000,
      },
      {
        id: 'msg-init-2',
        sender: 'admin',
        userName: 'fox (管理员)',
        message: '您好！包含完整 D1 数据库初始化与 R2 存储桶绑定的全套指引与支持。',
        createdAt: Date.now() - 3000000,
      }
    ])
  );

  const [websites, setWebsites] = useState<WebSiteItem[]>(() =>
    loadLocalStorage<WebSiteItem[]>(STORAGE_KEYS.WEBSITES, DEFAULT_WEBSITES)
  );

  const [webDavBackups, setWebDavBackups] = useState<WebDavBackupItem[]>(() =>
    loadLocalStorage<WebDavBackupItem[]>(STORAGE_KEYS.WEBDAV_BACKUPS, DEFAULT_WEBDAV_BACKUPS)
  );

  // Universal Recycle Bin state
  const [trashItems, setTrashItems] = useState<Array<{
    id: string;
    originId: string;
    originType: 'post' | 'book' | 'photo' | 'media' | 'mail' | 'chat' | 'product' | 'order';
    title: string;
    preview?: string;
    deletedAt: number;
    data: any;
  }>>(() => loadLocalStorage('fox3_trash_items', [
    {
      id: 'trash-demo-1',
      originId: 'post-old-sample',
      originType: 'post',
      title: '旧版 Cloudflare Workers 部署心得随笔',
      preview: '这是一篇早期测试文章，已归档移至全站回收站',
      deletedAt: Date.now() - 86400000 * 4,
      data: {
        id: 'post-old-sample',
        title: '旧版 Cloudflare Workers 部署心得随笔',
        content: '早期随笔内容...',
        category: '随笔',
        tags: ['Workers'],
        author: 'fox',
        createdAt: Date.now() - 86400000 * 10,
      }
    }
  ]));
  useEffect(() => saveLocalStorage('fox3_trash_items', trashItems), [trashItems]);

  const moveToTrash = useCallback((item: {
    originId: string;
    originType: 'post' | 'book' | 'photo' | 'media' | 'mail' | 'chat' | 'product' | 'order';
    title: string;
    preview?: string;
    data: any;
  }) => {
    const trashItem = {
      id: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      deletedAt: Date.now(),
      ...item,
    };
    setTrashItems(prev => [trashItem, ...prev]);
  }, []);

  const restoreFromTrash = useCallback((trashId: string) => {
    const item = trashItems.find(t => t.id === trashId);
    if (!item) return;

    if (item.originType === 'post' && item.data) {
      setPosts(prev => [item.data, ...prev]);
    } else if (item.originType === 'book' && item.data) {
      setBooks(prev => [item.data, ...prev]);
    } else if (item.originType === 'photo' && item.data) {
      setPhotos(prev => [item.data, ...prev]);
    } else if (item.originType === 'media' && item.data) {
      setMedia(prev => [item.data, ...prev]);
    } else if (item.originType === 'mail' && item.data) {
      setMails(prev => [item.data, ...prev]);
    } else if (item.originType === 'product' && item.data) {
      setProducts(prev => [item.data, ...prev]);
    } else if (item.originType === 'order' && item.data) {
      setOrders(prev => [item.data, ...prev]);
    }

    setTrashItems(prev => prev.filter(t => t.id !== trashId));
  }, [trashItems]);

  const requestImmediateSyncRef = useRef(false);
  const pendingRemovedUserItemIdsRef = useRef<Set<string>>(new Set());

  const isUrlReferencedElsewhere = useCallback((
    rawUrl: string,
    exclude?: {
      postIds?: string[];
      bookIds?: string[];
      photoIds?: string[];
      mediaIds?: string[];
      productIds?: string[];
      websiteIds?: string[];
    },
    currentSnapshot?: {
      posts: Post[];
      books: Book[];
      photos: Photo[];
      media: MediaItem[];
      products: Product[];
      websites: WebSiteItem[];
      systemSettings: SystemSettings;
    },
  ): boolean => {
    const snap = currentSnapshot;
    if (!snap || !rawUrl) return false;
    const extractKey = (val: string) => {
      if (!val) return '';
      if (val.startsWith('idb_file_')) return val;
      try {
        const clean = val.replace(/^https?:\/\/[^/]+/i, '');
        if (clean.startsWith('/api/files/')) {
          return decodeURIComponent(clean.slice('/api/files/'.length).split('?')[0]);
        }
      } catch {}
      return val;
    };
    const targetKey = extractKey(rawUrl);
    if (!targetKey) return false;
    const matches = (val?: string | null) => Boolean(val && (val === rawUrl || extractKey(val) === targetKey));

    const exPost = new Set(exclude?.postIds || []);
    const exBook = new Set(exclude?.bookIds || []);
    const exPhoto = new Set(exclude?.photoIds || []);
    const exMedia = new Set(exclude?.mediaIds || []);
    const exProduct = new Set(exclude?.productIds || []);
    const exWebsite = new Set(exclude?.websiteIds || []);

    for (const p of snap.posts) {
      if (exPost.has(p.id) || p.deleted) continue;
      if (matches(p.cover) || (typeof p.content === 'string' && (p.content.includes(rawUrl) || p.content.includes(targetKey)))) {
        return true;
      }
    }
    for (const b of snap.books) {
      if (exBook.has(b.id) || b.deleted) continue;
      if (matches(b.fileUrl) || matches(b.cover)) return true;
    }
    for (const ph of snap.photos) {
      if (exPhoto.has(ph.id) || ph.deleted) continue;
      if (matches(ph.url) || matches(ph.thumbnail)) return true;
    }
    for (const m of snap.media) {
      if (exMedia.has(m.id) || m.deleted) continue;
      if (matches(m.src) || matches(m.cover)) return true;
    }
    for (const pr of snap.products) {
      if (exProduct.has(pr.id)) continue;
      if (Array.isArray(pr.images) && pr.images.some(img => matches(img))) return true;
    }
    for (const w of snap.websites) {
      if (exWebsite.has(w.id)) continue;
      if (matches(w.poster)) return true;
    }
    for (const sKey of ['avatarUrl', 'heroIntroImage', 'fullBackgroundUrl', 'customFontUrl'] as const) {
      if (matches(snap.systemSettings[sKey])) return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    clearAdminSessionToken();
    clearUserSessionToken();
    setCurrentUser(null);
  }, []);

  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() =>
    loadLocalStorage<SystemSettings>(STORAGE_KEYS.SYSTEM_SETTINGS, DEFAULT_SETTINGS)
  );

  const [emailSettings, setEmailSettings] = useState<EmailSettings>(() =>
    (() => {
      const saved = loadLocalStorage<Partial<EmailSettings>>(STORAGE_KEYS.EMAIL_SETTINGS, {});
      return {
        ...DEFAULT_EMAIL_SETTINGS,
        ...saved,
        smtpSecurity: saved.smtpSecurity === 'starttls' || saved.smtpPort === 587 ? 'starttls' : 'ssl',
        verificationCodeLength: Math.min(8, Math.max(4, Number(saved.verificationCodeLength) || DEFAULT_EMAIL_SETTINGS.verificationCodeLength)),
        verificationEmailSubject: saved.verificationEmailSubject || DEFAULT_EMAIL_SETTINGS.verificationEmailSubject,
        verificationEmailTemplate: saved.verificationEmailTemplate || DEFAULT_EMAIL_SETTINGS.verificationEmailTemplate,
        cfEmailRouting: { ...DEFAULT_EMAIL_SETTINGS.cfEmailRouting, ...(saved.cfEmailRouting || {}) },
        imapConfig: saved.imapConfig ? { ...DEFAULT_EMAIL_SETTINGS.imapConfig!, ...saved.imapConfig } : DEFAULT_EMAIL_SETTINGS.imapConfig,
      } as EmailSettings;
    })()
  );

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() =>
    loadLocalStorage<PaymentSettings>(STORAGE_KEYS.PAYMENT_SETTINGS, DEFAULT_PAYMENT_SETTINGS)
  );

  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>(() =>
    loadLocalStorage<WebDavConfig>(STORAGE_KEYS.WEBDAV_CONFIG, DEFAULT_WEBDAV_CONFIG)
  );

  const [locale, setLocaleState] = useState<Locale>(() =>
    normalizeLocale(loadLocalStorage<unknown>(STORAGE_KEYS.LOCALE, 'zh-CN'))
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
  }, [locale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let active = true;
    let objectUrl = '';
    const applyFontVars = () => {
      const fontKey = systemSettings.fontFamily || 'default';
      const fontStacks: Record<string, string> = {
        default: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
        kaiti: `'Fox3KaitiFallback', 'KaiTi', 'STKaiti', 'Kaiti SC', 'DFKai-SB', 'BiauKai', 'AR PL UKai CN', 'Noto Serif SC', serif`,
        youyuan: `'YouYuan', 'Yuanti SC', 'STYuanti', 'Hiragino Maru Gothic ProN', 'PingFang SC', sans-serif`,
        qinzhuanshu: `'Fox3UploadedFont', 'FZXiaoZhuanTi-S13T', '方正小篆体', 'SentySeal', 'HanziPen SC', 'KaiTi', 'Noto Serif SC', serif`,
        custom: `'Fox3UploadedFont', 'Plus Jakarta Sans', 'KaiTi', -apple-system, sans-serif`,
      };
      const stack = fontStacks[fontKey] || fontStacks.default;
      document.documentElement.style.setProperty('--fox3-font-family', stack);
      document.documentElement.dataset.fox3Font = fontKey === 'default' ? 'default' : 'custom-active';
    };

    const loadCustomFont = async () => {
      const styleId = 'fox3-custom-font-style';
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      let resolvedUrl = '';
      try {
        const localBlob = await getFileFromIndexedDB('idb_file_fox3_custom_font');
        if (localBlob instanceof Blob) {
          objectUrl = URL.createObjectURL(localBlob);
          resolvedUrl = objectUrl;
        } else if (typeof localBlob === 'string' && localBlob) {
          resolvedUrl = localBlob;
        }
      } catch {}
      if (!resolvedUrl && systemSettings.customFontUrl && !/^(?:idb_file_|blob:)/i.test(systemSettings.customFontUrl)) {
        resolvedUrl = systemSettings.customFontUrl;
      }
      if (!active) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      if (resolvedUrl) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = `@font-face { font-family: 'Fox3UploadedFont'; src: url('${resolvedUrl.replace(/'/g, "\\'")}'); font-display: swap; }`;
      } else if (styleEl) {
        styleEl.textContent = '';
      }
      applyFontVars();
    };

    applyFontVars();
    void loadCustomFont();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [systemSettings.fontFamily, systemSettings.customFontUrl, systemSettings.customFontName]);

  const setLocale = (loc: Locale) => {
    const normalized = normalizeLocale(loc);
    setLocaleState(normalized);
    saveLocalStorage(STORAGE_KEYS.LOCALE, normalized);
  };

  const t = useCallback((path: string): string => {
    const dict = i18nDict[locale] || i18nDict['zh-CN'];
    return getTranslation(dict, path);
  }, [locale]);

  const [themeMode, setThemeModeState] = useState<GlobalThemeMode>(() => {
    const saved = loadLocalStorage<unknown>('fox3_global_theme', 'modern');
    return isGlobalThemeMode(saved) ? saved : 'modern';
  });

  const setThemeMode = (mode: GlobalThemeMode) => {
    if (!isGlobalThemeMode(mode)) return;
    setThemeModeState(mode);
    saveLocalStorage('fox3_global_theme', mode);
    try {
      const bc = new BroadcastChannel('fox3_realtime_sync');
      bc.postMessage({ type: 'SYNC_ALL', payload: { themeMode: mode } });
      bc.close();
    } catch {}
  };

  const [darkMode, setDarkModeState] = useState<boolean>(false);

  const setDarkMode = (dark: boolean) => {
    setDarkModeState(dark);
    try {
      localStorage.removeItem('fox3_dark_mode');
    } catch {}
    document.documentElement.classList.remove('dark');
  };

  useEffect(() => {
    // Night mode removed: keep document free of forced dark class
    document.documentElement.classList.remove('dark');
  }, []);

  const [deviceMode, setDeviceModeState] = useState<DeviceViewMode>('responsive');

  const setDeviceMode = (mode: DeviceViewMode) => {
    setDeviceModeState(mode);
  };

  const [channelConnected, setChannelConnected] = useState<boolean>(false);
  const [cloudServicesStatus, setCloudServicesStatus] = useState<{ d1: boolean; r2: boolean; kv: boolean; objectStorage: boolean; objectStorageProvider: string | null }>({
    d1: false,
    r2: false,
    kv: false,
    objectStorage: false,
    objectStorageProvider: null,
  });

  const refreshChannelStatus = useCallback(async (): Promise<boolean> => {
    try {
      const statusHeaders: Record<string, string> = { Accept: 'application/json' };
      const adminToken = getAdminSessionToken();
      if (adminToken) statusHeaders.Authorization = `Bearer ${adminToken}`;
      const res = await fetch('/api/status', { method: 'GET', headers: statusHeaders });
      const contentType = res.headers.get('content-type') || '';
      // Only treat as connected if response is real JSON and channelOnline is true
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const isOk = Boolean(data && data.success && data.channelOnline === true);
        setChannelConnected(isOk);
        if (data && data.cloudServices) {
          setCloudServicesStatus({
            d1: Boolean(data.cloudServices.d1),
            r2: Boolean(data.cloudServices.r2),
            kv: Boolean(data.cloudServices.kv),
            objectStorage: Boolean(data.cloudServices.objectStorage),
            objectStorageProvider: typeof data.cloudServices.objectStorageProvider === 'string' ? data.cloudServices.objectStorageProvider : null,
          });
        } else {
          setCloudServicesStatus({ d1: false, r2: false, kv: false, objectStorage: false, objectStorageProvider: null });
        }
        return isOk;
      }
      setChannelConnected(false);
      setCloudServicesStatus({ d1: false, r2: false, kv: false, objectStorage: false, objectStorageProvider: null });
      return false;
    } catch {
      setChannelConnected(false);
      setCloudServicesStatus({ d1: false, r2: false, kv: false, objectStorage: false, objectStorageProvider: null });
      return false;
    }
  }, []);

  useEffect(() => {
    void refreshChannelStatus();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshChannelStatus(); };
    const onOnline = () => { void refreshChannelStatus(); };
    const onOffline = () => {
      setChannelConnected(false);
      setCloudServicesStatus({ d1: false, r2: false, kv: false, objectStorage: false, objectStorageProvider: null });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshChannelStatus]);

  const [viewModes, setViewModesState] = useState<Record<string, ViewMode>>(() =>
    loadLocalStorage<Record<string, ViewMode>>(STORAGE_KEYS.VIEW_MODES, {
      blog: 'original',
      books: 'original',
      gallery: 'original',
      media: 'original',
    })
  );

  const setViewMode = (section: string, mode: ViewMode) => {
    setViewModesState(prev => {
      const next = { ...prev, [section]: mode };
      saveLocalStorage(STORAGE_KEYS.VIEW_MODES, next);
      return next;
    });
  };

  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncedAt: 0,
    status: 'idle',
    message: '站点内容由 D1 提供；任何访客均可刷新，编辑仅管理员可发布',
  });

  const [transferProgress, setTransferProgress] = useState<TransferProgress>({
    active: false,
    type: 'upload',
    fileName: '',
    percent: 0,
    speed: '',
  });

  const transferAbortRef = useRef<AbortController | null>(null);
  const [webDavConnectionState, setWebDavConnectionState] = useState<{ status: 'unknown' | 'checking' | 'connected' | 'error'; checkedAt: number; message: string }>({ status: 'unknown', checkedAt: 0, message: '尚未执行远端连通性验证' });
  const testWebDavConnection = useCallback(async (config: WebDavConfig = webDavConfig): Promise<boolean> => {
    setWebDavConnectionState({ status: 'checking', checkedAt: Date.now(), message: '正在通过服务端验证 WebDAV…' });
    try {
      const result = await testWebDav(config);
      setWebDavConnectionState({ status: 'connected', checkedAt: result.checkedAt, message: 'WebDAV 服务器认证连接成功' });
      return true;
    } catch (error: any) {
      setWebDavConnectionState({ status: 'error', checkedAt: Date.now(), message: error?.message || 'WebDAV 连接失败' });
      return false;
    }
  }, [webDavConfig]);
  const refreshWebDavBackups = useCallback(async () => {
    const files = await listWebDavFiles(webDavConfig);
    setWebDavBackups(files);
  }, [webDavConfig]);
  const cancelTransfer = useCallback(() => {
    transferAbortRef.current?.abort();
    transferAbortRef.current = null;
    setTransferProgress(prev => ({ ...prev, active: false, percent: 0 }));
  }, []);
  const [multiTransferProgress, setMultiTransferProgress] = useState<{
    active: boolean;
    type: 'upload' | 'download' | 'backup' | 'restore';
    currentFileName: string;
    currentIndex: number;
    totalCount: number;
    overallPercent: number;
    speed?: string;
  }>({
    active: false,
    type: 'upload',
    currentFileName: '',
    currentIndex: 0,
    totalCount: 0,
    overallPercent: 0,
    speed: '',
  });

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const startMultiTransfer = useCallback((type: 'upload' | 'download' | 'backup' | 'restore', totalCount: number, firstFileName: string) => {
    setMultiTransferProgress({
      active: true,
      type,
      currentFileName: firstFileName,
      currentIndex: 1,
      totalCount,
      overallPercent: 5,
      speed: '3.2 MB/s',
    });
  }, []);

  const updateMultiTransferProgress = useCallback((currentIndex: number, currentFileName: string, overallPercent: number, speed?: string) => {
    setMultiTransferProgress(prev => ({
      ...prev,
      currentIndex,
      currentFileName,
      overallPercent: Math.min(100, Math.max(0, overallPercent)),
      speed: speed || prev.speed,
    }));
  }, []);

  const finishMultiTransfer = useCallback(() => {
    setMultiTransferProgress(prev => ({ ...prev, overallPercent: 100 }));
    setTimeout(() => {
      setMultiTransferProgress(prev => ({ ...prev, active: false, overallPercent: 0 }));
    }, 600);
  }, []);

  // Persist mailbox settings on this browser so SMTP/API credentials survive reloads.
  // These settings are deliberately excluded from cross-device sync below and secrets
  // remain redacted from exported backups.
  useEffect(() => saveLocalStorage(STORAGE_KEYS.CURRENT_USER, currentUser), [currentUser]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.USERS, users), [users]);
  // Public content localStorage is a disposable browser cache only. D1 hydrates the
  // canonical snapshot on startup and overwrites stale cache; admin writes go to D1.
  useEffect(() => saveLocalStorage(STORAGE_KEYS.POSTS, posts), [posts]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.BOOKS, books.map(({ content: _localText, ...book }) => book)), [books]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.PHOTOS, photos), [photos]);
  useEffect(() => saveLocalStorage('fox3_photo_folders', photoFolders), [photoFolders]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.MEDIA, media), [media]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.PRODUCTS, products), [products]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.WEBSITES, websites), [websites]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.MAILS, mails), [mails]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.ORDERS, orders), [orders]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.CHAT_MESSAGES, chatMessages), [chatMessages]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.SYSTEM_SETTINGS, systemSettings), [systemSettings]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.EMAIL_SETTINGS, emailSettings), [emailSettings]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.PAYMENT_SETTINGS, paymentSettings), [paymentSettings]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.WEBDAV_CONFIG, webDavConfig), [webDavConfig]);
  useEffect(() => saveLocalStorage(STORAGE_KEYS.WEBDAV_BACKUPS, webDavBackups), [webDavBackups]);
  useEffect(() => saveLocalStorage('fox3_trash_items', trashItems), [trashItems]);

  const updateSystemSettings = (newSettings: Partial<SystemSettings>) => {
    setSystemSettings(prev => ({ ...prev, ...newSettings }));
  };

  const updateEmailSettings = (newSettings: Partial<EmailSettings>) => {
    setEmailSettings(prev => ({ ...prev, ...newSettings }));
  };

  const updatePaymentSettings = (newSettings: Partial<PaymentSettings>) => {
    setPaymentSettings(prev => ({ ...prev, ...newSettings }));
  };

  const updateWebDavConfig = (newConfig: Partial<WebDavConfig>) => {
    setWebDavConfig(prev => ({ ...prev, ...newConfig }));
  };

  const addStorageUsage = (bytes: number) => {
    setSystemSettings(prev => ({
      ...prev,
      usedCapacityBytes: Math.max(0, (prev.usedCapacityBytes || 0) + bytes)
    }));
  };

  const startTransfer = (type: TransferProgress['type'], fileName: string) => {
    setTransferProgress({
      active: true,
      type,
      fileName,
      percent: 8,
      speed: '',
    });
  };

  const updateTransferPercent = (percent: number) => {
    setTransferProgress(prev => ({
      ...prev,
      percent: Math.min(100, Math.max(0, percent)),
    }));
  };

  const finishTransfer = () => {
    setTransferProgress(prev => ({ ...prev, percent: 100 }));
    setTimeout(() => {
      setTransferProgress(prev => ({ ...prev, active: false, percent: 0 }));
    }, 500);
  };

  const toggleBookmark = (postId: string) => {
    setPosts(prev => {
      const updated = prev.map(p => (p.id === postId ? { ...p, isBookmarked: !p.isBookmarked } : p));
      // Broadcast immediate bookmark update
      try {
        const bc = new BroadcastChannel('fox3_realtime_sync');
        bc.postMessage({ type: 'SYNC_ALL', payload: { posts: updated } });
        bc.close();
      } catch (e) {}
      return updated;
    });
  };

  // BroadcastChannel for instant cross-tab / cross-window sync
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('fox3_realtime_sync');
      bc.onmessage = (event) => {
        if (!event.data || !event.data.type) return;
        const { type, payload } = event.data;
        if (type === 'SYNC_ALL' && payload) {
          if (payload.posts) setPosts(payload.posts);
          if (payload.books) setBooks(payload.books);
          if (payload.photos) setPhotos(payload.photos);
          if (payload.media) setMedia(payload.media);
          if (payload.mails) setMails(payload.mails);
          if (payload.products) setProducts(payload.products);
          if (payload.orders) setOrders(payload.orders);
          if (payload.chatMessages) setChatMessages(payload.chatMessages);
          if (payload.webDavBackups) setWebDavBackups(payload.webDavBackups);
          if (payload.webDavConfig) setWebDavConfig(payload.webDavConfig);
          if (payload.trashItems) setTrashItems(payload.trashItems);
          if (payload.systemSettings) setSystemSettings(payload.systemSettings);
          if (isGlobalThemeMode(payload.themeMode)) {
            setThemeModeState(payload.themeMode);
            saveLocalStorage('fox3_global_theme', payload.themeMode);
          }
        }
      };
    } catch (e) {
      // BroadcastChannel not supported in this environment
    }
    return () => {
      if (bc) bc.close();
    };
  }, []);

  // Canonical site content always hydrates from D1. Browser data is only an in-memory
  // fallback/cache; WebDAV backup metadata, private mail/orders/chat and admin settings
  // never enter this public content channel.
  const siteContentRevisionRef = useRef(0);
  const siteUserMediaUpdatedAtRef = useRef(0);
  const siteContentReadyRef = useRef(false);
  const siteContentLoadRef = useRef(false);
  const siteContentConflictRef = useRef(false);
  const siteContentLastSavedRef = useRef('');
  const userMediaRevisionRef = useRef(0);
  const userMediaReadyRef = useRef(false);
  const userMediaLastSavedRef = useRef('');
  const userMediaBaseRef = useRef<{ books: Book[]; photos: Photo[]; media: MediaItem[] }>({ books: [], photos: [], media: [] });
  const [userMediaRetryKey, setUserMediaRetryKey] = useState(0);
  const [siteContentNeedsSeed, setSiteContentNeedsSeed] = useState(false);
  const applyPublicSiteContent = useCallback((data: any, initialized: boolean, legacyAvailable = false) => {
    const preserveLocalOwned = <T extends { id: string; ownerId?: string; [key: string]: any }>(published: T[], cached: T[]) => {
      const publishedIds = new Set(published.map(item => item.id));
      const hasLocalFile = (item: T) => ['url', 'src', 'fileUrl', 'cover', 'thumbnail', 'poster', 'icon'].some(key => {
        const value = item[key];
        return typeof value === 'string' && (value.startsWith('idb_file_') || value.startsWith('data:') || value.startsWith('blob:'));
      }) || (Array.isArray(item.images) && item.images.some((url: unknown) => typeof url === 'string' && /^(?:idb_file_|data:|blob:)/i.test(url))) || (typeof item.content === 'string' && /(?:idb_file_|data:|blob:)/i.test(item.content));
      const localById = new Map(cached.filter(hasLocalFile).map(item => [item.id, item]));
      const hasRemoteFile = (item: T) => ['url', 'src', 'fileUrl', 'cover', 'thumbnail', 'poster', 'icon'].some(key => {
        const value = item[key];
        return typeof value === 'string' && value.length > 0 && !/^(?:idb_file_|data:|blob:)/i.test(value);
      }) || (Array.isArray(item.images) && item.images.some((url: unknown) => typeof url === 'string' && !/^(?:idb_file_|data:|blob:)/i.test(url)));
      const merged = published.map(item => {
        const cachedItem = localById.get(item.id);
        return cachedItem && !hasRemoteFile(item) ? cachedItem : item;
      });
      const mergedIds = new Set(merged.map(item => item.id));
      return [...merged, ...cached.filter(item => !mergedIds.has(item.id) && hasLocalFile(item))];
    };
    if (initialized || legacyAvailable) {
      if (Array.isArray(data?.posts)) setPosts(prev => preserveLocalOwned(data.posts, prev));
      if (Array.isArray(data?.books)) setBooks(prev => preserveLocalOwned(data.books, prev));
      if (Array.isArray(data?.photos)) setPhotos(prev => preserveLocalOwned(data.photos, prev));
      if (Array.isArray(data?.photoFolders)) setPhotoFolders(data.photoFolders);
      if (Array.isArray(data?.media)) setMedia(prev => preserveLocalOwned(data.media, prev));
      if (Array.isArray(data?.products)) setProducts(prev => preserveLocalOwned(data.products, prev));
      if (Array.isArray(data?.websites)) setWebsites(prev => preserveLocalOwned(data.websites, prev));
    } else if (!getAdminSessionToken()) {
      // A fresh public deployment must not show device-specific starter samples as if published.
      setPosts([]); setBooks(prev => prev.filter(item => item.ownerId && item.ownerId !== 'user_fox_admin'));
      setPhotos(prev => prev.filter(item => item.ownerId && item.ownerId !== 'user_fox_admin'));
      setMedia(prev => prev.filter(item => item.ownerId && item.ownerId !== 'user_fox_admin'));
      setPhotoFolders([]); setProducts([]); setWebsites([]);
    }
    if (data?.systemSettings && typeof data.systemSettings === 'object') {
      setSystemSettings(prev => ({ ...prev, ...data.systemSettings }));
    }
    if (isGlobalThemeMode(data?.themeMode)) setThemeModeState(data.themeMode);
  }, []);

  const fetchLatestSiteContent = useCallback(async (showStatus: boolean) => {
    if (siteContentLoadRef.current) return;
    siteContentLoadRef.current = true;
    if (showStatus) setSyncState(prev => ({ ...prev, isSyncing: true, status: 'syncing', message: '正在从站点数据库读取最新内容…' }));
    try {
      const userToken = getUserSessionToken();
      const response = await fetch('/api/site-content', { method: 'GET', headers: { Accept: 'application/json', ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}) }, cache: 'no-store' });
      const envelope = await response.json().catch(() => null);
      if (!response.ok || envelope?.success !== true) throw new Error(envelope?.error || `站点数据库读取失败 (HTTP ${response.status})`);
      const nextRevision = Number(envelope.revision || 0);
      const nextUserMediaUpdatedAt = Number(envelope.userMediaUpdatedAt || 0);
      if (currentUser?.role === 'user' && Number.isInteger(Number(envelope.userMediaRevision))) {
        userMediaRevisionRef.current = Number(envelope.userMediaRevision);
      }
      const wasReady = siteContentReadyRef.current;
      const revisionChanged = nextRevision !== siteContentRevisionRef.current;
      const userMediaChanged = nextUserMediaUpdatedAt !== siteUserMediaUpdatedAtRef.current;
      if (siteContentConflictRef.current && (revisionChanged || userMediaChanged) && !showStatus) return;
      siteContentRevisionRef.current = nextRevision;
      siteUserMediaUpdatedAtRef.current = nextUserMediaUpdatedAt;
      if (!wasReady || revisionChanged || userMediaChanged) applyPublicSiteContent(envelope.data || {}, Boolean(envelope.initialized), Boolean(envelope.legacyAvailable));
      if (showStatus) siteContentConflictRef.current = false;
      siteContentReadyRef.current = true;
      setSiteContentNeedsSeed(!envelope.initialized && Boolean(getAdminSessionToken()));
      setSyncState({ isSyncing: false, lastSyncedAt: Number(envelope.updatedAt || Date.now()), status: 'synced', message: envelope.initialized ? '已读取站点数据库中的最新内容' : envelope.legacyAvailable ? '已安全读取旧云端公开内容，正在迁入站点数据库' : 'D1 已连接，站点内容尚未初始化' });
    } catch (error: any) {
      if (showStatus || !siteContentReadyRef.current) setSyncState(prev => ({ ...prev, isSyncing: false, status: 'error', message: error?.message || '无法读取站点内容数据库；保留当前内存内容' }));
    } finally {
      siteContentLoadRef.current = false;
    }
  }, [applyPublicSiteContent, currentUser?.id, currentUser?.role]);

  const triggerManualSync = useCallback(async () => {
    // Read public site content and retry only the signed-in user's own media directory; never touch WebDAV backups.
    await fetchLatestSiteContent(true);
    setUserMediaRetryKey(value => value + 1);
  }, [fetchLatestSiteContent]);

  useEffect(() => {
    void fetchLatestSiteContent(false);
    const onVisibility = () => { if (document.visibilityState === 'visible') void fetchLatestSiteContent(false); };
    const onOnline = () => { void fetchLatestSiteContent(false); };
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void fetchLatestSiteContent(false); }, 60_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [fetchLatestSiteContent]);

  const latestSiteDataRef = useRef<{
    posts: Post[];
    books: Book[];
    photos: Photo[];
    photoFolders: Array<{ id: string; name: string; createdAt: number }>;
    media: MediaItem[];
    products: Product[];
    websites: WebSiteItem[];
    systemSettings: SystemSettings;
    themeMode: GlobalThemeMode;
    currentUser: User | null;
    siteContentNeedsSeed: boolean;
  }>({
    posts,
    books,
    photos,
    photoFolders,
    media,
    products,
    websites,
    systemSettings,
    themeMode,
    currentUser,
    siteContentNeedsSeed,
  });
  latestSiteDataRef.current = {
    posts,
    books,
    photos,
    photoFolders,
    media,
    products,
    websites,
    systemSettings,
    themeMode,
    currentUser,
    siteContentNeedsSeed,
  };

  const buildPublicSiteContentPayload = useCallback(() => {
    const snap = latestSiteDataRef.current;
    const publicSettingKeys = ['siteName', 'headerTagline', 'shopCategories', 'themeColor', 'customPaletteBg', 'fullBackgroundUrl', 'avatarUrl', 'heroIntroImage', 'heroBadge', 'heroTitle', 'heroSubtitle', 'transparentCards', 'bottomButtonsEnabled', 'hideNonBlogForGuests', 'allowUserMediaManagement', 'allowPublicSitesAccess', 'globalTheme', 'deviceView', 'mobileTheme', 'timezone', 'fontFamily', 'customFontName', 'customFontUrl', 'uploadedThemeName'];
    const hasLocalUrl = (value: unknown) => typeof value === 'string' && /^(?:idb_file_|data:|blob:)/i.test(value);
    const removeLocalRefs = (value: string) => value.replace(/(?:idb_file_[\w.-]+|data:[^\s"'<>)]*)/gi, '');
    const publicSettings = Object.fromEntries(publicSettingKeys.filter(key => (snap.systemSettings as any)[key] !== undefined && !hasLocalUrl((snap.systemSettings as any)[key])).map(key => [key, (snap.systemSettings as any)[key]]));
    const publicPosts = snap.posts.map(post => ({ ...post, cover: hasLocalUrl(post.cover) ? undefined : post.cover, content: typeof post.content === 'string' ? removeLocalRefs(post.content) : post.content }));
    const publicBooks = snap.books.filter(book => !hasLocalUrl(book.fileUrl)).map(({ content: _localText, ...book }) => ({ ...book, cover: hasLocalUrl(book.cover) ? undefined : book.cover }));
    const publicPhotos = snap.photos.filter(photo => !hasLocalUrl(photo.url)).map(photo => ({ ...photo, thumbnail: hasLocalUrl(photo.thumbnail) ? undefined : photo.thumbnail }));
    const publicMedia = snap.media.filter(item => !hasLocalUrl(item.src)).map(item => ({ ...item, cover: hasLocalUrl(item.cover) ? undefined : item.cover }));
    const publicProducts = snap.products.map(product => ({ ...product, images: Array.isArray(product.images) ? product.images.filter(url => !hasLocalUrl(url)) : product.images }));
    const publicWebsites = snap.websites.map(item => ({ ...item, poster: hasLocalUrl(item.poster) ? undefined : item.poster }));
    const data: Record<string, any> = { posts: publicPosts, books: publicBooks, photos: publicPhotos, photoFolders: snap.photoFolders, media: publicMedia, products: publicProducts, websites: publicWebsites, systemSettings: publicSettings };
    if (isGlobalThemeMode(snap.themeMode)) data.themeMode = snap.themeMode;
    return { data, serializedData: JSON.stringify(data) };
  }, []);

  const persistSiteContentNow = useCallback(async (useKeepalive = false) => {
    const token = getAdminSessionToken();
    if (!siteContentReadyRef.current || !token) return;
    const { data, serializedData } = buildPublicSiteContentPayload();
    if (serializedData === siteContentLastSavedRef.current && pendingRemovedUserItemIdsRef.current.size === 0) return;

    if (pendingRemovedUserItemIdsRef.current.size > 0) {
      const removedIds = [...pendingRemovedUserItemIdsRef.current];
      pendingRemovedUserItemIdsRef.current.clear();
      try {
        await fetch('/api/admin/remove-user-media-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemIds: removedIds }),
          keepalive: useKeepalive,
        });
      } catch {}
    }

    if (serializedData === siteContentLastSavedRef.current) return;
    setSyncState(prev => ({ ...prev, isSyncing: true, status: 'syncing', message: '正在将管理员发布的站点内容保存至 D1…' }));
    try {
      const response = await fetch('/api/site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expectedRevision: siteContentRevisionRef.current, data }),
        keepalive: useKeepalive,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true || result?.syncedToCloud !== true) {
        if (response.status === 409) {
          if (typeof result?.revision === 'number' && result.revision > 0 && requestImmediateSyncRef.current) {
            siteContentRevisionRef.current = result.revision;
            const retryRes = await fetch('/api/site-content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ expectedRevision: siteContentRevisionRef.current, data }),
              keepalive: useKeepalive,
            });
            const retryResult = await retryRes.json().catch(() => null);
            if (retryRes.ok && retryResult?.success === true && retryResult?.syncedToCloud === true) {
              siteContentRevisionRef.current = Number(retryResult.revision || siteContentRevisionRef.current);
              siteContentLastSavedRef.current = serializedData;
              siteContentConflictRef.current = false;
              setSiteContentNeedsSeed(false);
              setSyncState({ isSyncing: false, lastSyncedAt: Number(retryResult.updatedAt || Date.now()), status: 'synced', message: '站点内容已持久保存到 D1' });
              return;
            }
          }
          siteContentConflictRef.current = true;
        }
        throw new Error(result?.error || `站点内容持久化失败 (HTTP ${response.status})`);
      }
      siteContentRevisionRef.current = Number(result.revision || siteContentRevisionRef.current);
      siteContentLastSavedRef.current = serializedData;
      siteContentConflictRef.current = false;
      setSiteContentNeedsSeed(false);
      setSyncState({ isSyncing: false, lastSyncedAt: Number(result.updatedAt || Date.now()), status: 'synced', message: latestSiteDataRef.current.siteContentNeedsSeed ? '站点内容已迁移并持久保存到 D1' : '站点内容已持久保存到 D1' });
    } catch (error: any) {
      setSyncState(prev => ({ ...prev, isSyncing: false, status: 'error', message: error?.message || '站点内容保存失败；请刷新后解决版本冲突' }));
    }
  }, [buildPublicSiteContentPayload]);

  const siteContentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const siteContentFirstEffectRef = useRef(true);
  useEffect(() => {
    if (siteContentFirstEffectRef.current) { siteContentFirstEffectRef.current = false; return; }
    if (!siteContentReadyRef.current || !getAdminSessionToken()) return;
    if (siteContentTimeoutRef.current) clearTimeout(siteContentTimeoutRef.current);
    const delay = requestImmediateSyncRef.current ? 0 : 350;
    siteContentTimeoutRef.current = setTimeout(() => {
      const wasImmediate = requestImmediateSyncRef.current;
      void persistSiteContentNow(false).finally(() => {
        if (wasImmediate) requestImmediateSyncRef.current = false;
      });
    }, delay);
    return () => { if (siteContentTimeoutRef.current) clearTimeout(siteContentTimeoutRef.current); };
  }, [posts, books, photos, photoFolders, media, products, websites, systemSettings, themeMode, currentUser, siteContentNeedsSeed, persistSiteContentNow]);

  const userMediaSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMediaLocalStateRef = useRef({ books, photos, media });
  userMediaLocalStateRef.current = { books, photos, media };
  useEffect(() => {
    const user = currentUser?.role === 'user' ? currentUser : null;
    const token = getUserSessionToken();
    userMediaReadyRef.current = false;
    userMediaLastSavedRef.current = '';
    if (!user) return;
    if (!token) {
      setSyncState(prev => ({ ...prev, status: 'error', message: '当前为本机用户会话，个人文件列表暂不能跨设备同步' }));
      return;
    }
    let cancelled = false;
    const own = <T extends { ownerId?: string; ownerUsername?: string }>(items: T[]) => items.filter(item => item.ownerId === user.id || (!item.ownerId && item.ownerUsername?.toLowerCase() === user.username.toLowerCase()));
    const isLocalFile = (value: unknown) => typeof value === 'string' && /^(?:idb_file_|data:|blob:)/i.test(value);
    const makeShareable = (data: { books: Book[]; photos: Photo[]; media: MediaItem[] }) => ({
      books: data.books.filter(item => !isLocalFile(item.fileUrl)),
      photos: data.photos.filter(item => !isLocalFile(item.url)),
      media: data.media.filter(item => !isLocalFile(item.src)),
    });
    const mergeUserItems = <T extends { id: string; ownerId?: string; ownerUsername?: string; [key: string]: any }>(previous: T[], incoming: T[], initialized: boolean) => {
      const isOwner = (item: T) => item.ownerId === user.id || (!item.ownerId && item.ownerUsername?.toLowerCase() === user.username.toLowerCase());
      const isBrowserOnly = (item: T) => ['url', 'src', 'fileUrl'].some(key => isLocalFile(item[key]));
      const retained = previous.filter(item => !isOwner(item) || isBrowserOnly(item));
      const ownIncoming = initialized ? incoming : own(previous);
      const all = [...retained, ...ownIncoming];
      const seen = new Set<string>();
      return all.filter(item => !seen.has(item.id) && Boolean(seen.add(item.id)));
    };
    void fetch('/api/user-media', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' })
      .then(async response => {
        const envelope = await response.json().catch(() => null);
        if (!response.ok || envelope?.success !== true) throw new Error(envelope?.error || '用户媒体读取失败');
        if (cancelled) return;
        const initialized = Boolean(envelope.initialized);
        const data = envelope.data || { books: [], photos: [], media: [] };
        setBooks(prev => mergeUserItems(prev, Array.isArray(data.books) ? data.books : [], initialized));
        setPhotos(prev => mergeUserItems(prev, Array.isArray(data.photos) ? data.photos : [], initialized));
        setMedia(prev => mergeUserItems(prev, Array.isArray(data.media) ? data.media : [], initialized));
        userMediaRevisionRef.current = Number(envelope.revision || 0);
        const serverData = makeShareable({ books: own(data.books || []), photos: own(data.photos || []), media: own(data.media || []) });
        userMediaBaseRef.current = initialized ? serverData : { books: [], photos: [], media: [] };
        userMediaLastSavedRef.current = initialized ? JSON.stringify(serverData) : '';
        userMediaReadyRef.current = true;
      })
      .catch(error => {
        if (!cancelled) setSyncState(prev => ({ ...prev, status: 'error', message: error?.message || '个人文件读取失败；当前设备缓存仍保留' }));
      });
    return () => { cancelled = true; userMediaReadyRef.current = false; };
  }, [currentUser?.id, currentUser?.username, currentUser?.role]);

  const buildUserMediaPayload = useCallback(() => {
    const user = latestSiteDataRef.current.currentUser;
    if (!user || user.role !== 'user') return null;
    const snap = userMediaLocalStateRef.current;
    const isOwner = (item: { ownerId?: string; ownerUsername?: string }) => item.ownerId === user.id || (!item.ownerId && item.ownerUsername?.toLowerCase() === user.username.toLowerCase());
    const isLocalFile = (value: unknown) => typeof value === 'string' && /^(?:idb_file_|data:|blob:)/i.test(value);
    const data = {
      books: snap.books.filter(item => isOwner(item) && !isLocalFile(item.fileUrl)).map(({ content: _localText, ...book }) => book),
      photos: snap.photos.filter(item => isOwner(item) && !isLocalFile(item.url)),
      media: snap.media.filter(item => isOwner(item) && !isLocalFile(item.src)),
    };
    return { user, isOwner, isLocalFile, data, serialized: JSON.stringify(data) };
  }, []);

  const persistUserMediaNow = useCallback(async (useKeepalive = false) => {
    const token = getUserSessionToken();
    const payload = buildUserMediaPayload();
    if (!payload || !token || !userMediaReadyRef.current) return;
    if (payload.serialized === userMediaLastSavedRef.current) return;
    try {
      const response = await fetch('/api/user-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expectedRevision: userMediaRevisionRef.current, data: payload.data }),
        keepalive: useKeepalive,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) {
        const syncError: any = new Error(result?.error || `个人文件同步失败 (HTTP ${response.status})`);
        syncError.status = response.status;
        throw syncError;
      }
      userMediaRevisionRef.current = Number(result.revision || userMediaRevisionRef.current + 1);
      userMediaLastSavedRef.current = payload.serialized;
      userMediaBaseRef.current = payload.data;
      setSyncState({ isSyncing: false, lastSyncedAt: Number(result.updatedAt || Date.now()), status: 'synced', message: '个人文件目录已保存到 D1' });
    } catch (error: any) {
      if (error?.status === 409) {
        try {
          const latestResponse = await fetch('/api/user-media', { headers: { Authorization: `Bearer ${getUserSessionToken()}`, Accept: 'application/json' }, cache: 'no-store' });
          const latestEnvelope = await latestResponse.json().catch(() => null);
          if (latestResponse.ok && latestEnvelope?.success && latestEnvelope.initialized) {
            const { isOwner, isLocalFile } = payload;
            const latest = {
              books: (latestEnvelope.data?.books || []).filter(isOwner),
              photos: (latestEnvelope.data?.photos || []).filter(isOwner),
              media: (latestEnvelope.data?.media || []).filter(isOwner),
            };
            const localNow = {
              books: userMediaLocalStateRef.current.books.filter(isOwner),
              photos: userMediaLocalStateRef.current.photos.filter(isOwner),
              media: userMediaLocalStateRef.current.media.filter(isOwner),
            };
            const mergeChanges = <T extends { id: string }>(baseItems: T[], localItems: T[], remoteItems: T[]) => {
              const base = new Map(baseItems.map(item => [item.id, item]));
              const local = new Map(localItems.map(item => [item.id, item]));
              const remote = new Map(remoteItems.map(item => [item.id, item]));
              const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
              const merged: T[] = [];
              for (const id of ids) {
                const before = base.get(id);
                const editedHere = JSON.stringify(local.get(id) ?? null) !== JSON.stringify(before ?? null);
                const chosen = editedHere ? local.get(id) : remote.get(id);
                if (chosen) merged.push(chosen);
              }
              return merged;
            };
            const baseline = userMediaBaseRef.current;
            const rebased = {
              books: mergeChanges(baseline.books, localNow.books, latest.books),
              photos: mergeChanges(baseline.photos, localNow.photos, latest.photos),
              media: mergeChanges(baseline.media, localNow.media, latest.media),
            };
            userMediaRevisionRef.current = Number(latestEnvelope.revision || userMediaRevisionRef.current);
            userMediaBaseRef.current = latest;
            userMediaLastSavedRef.current = JSON.stringify(latest);
            const mergeState = <T extends { ownerId?: string; ownerUsername?: string; id: string }>(previous: T[], merged: T[]) => {
              const localOnly = previous.filter(item => isOwner(item) && ['url', 'src', 'fileUrl'].some(key => isLocalFile((item as any)[key])));
              const others = previous.filter(item => !isOwner(item));
              const all = [...others, ...merged, ...localOnly];
              return all.filter((item, index) => all.findIndex(other => other.id === item.id) === index);
            };
            setBooks(prev => mergeState(prev, rebased.books));
            setPhotos(prev => mergeState(prev, rebased.photos));
            setMedia(prev => mergeState(prev, rebased.media));
            setSyncState(prev => ({ ...prev, status: 'syncing', message: '已合并其他设备的文件更新，正在重试保存' }));
            return;
          }
        } catch {}
      }
      setSyncState(prev => ({ ...prev, isSyncing: false, status: 'error', message: error?.message || '个人文件同步失败；请刷新后重试' }));
    }
  }, [buildUserMediaPayload]);

  useEffect(() => {
    if (currentUser?.role !== 'user' || !getUserSessionToken() || !userMediaReadyRef.current) return;
    const payload = buildUserMediaPayload();
    if (!payload || payload.serialized === userMediaLastSavedRef.current) return;
    if (userMediaSaveTimeoutRef.current) clearTimeout(userMediaSaveTimeoutRef.current);
    const delay = requestImmediateSyncRef.current ? 0 : 350;
    userMediaSaveTimeoutRef.current = setTimeout(() => {
      const wasImmediate = requestImmediateSyncRef.current;
      void persistUserMediaNow(false).finally(() => {
        if (wasImmediate) requestImmediateSyncRef.current = false;
      });
    }, delay);
    return () => { if (userMediaSaveTimeoutRef.current) clearTimeout(userMediaSaveTimeoutRef.current); };
  }, [books, photos, media, currentUser, userMediaRetryKey, buildUserMediaPayload, persistUserMediaNow]);

  useEffect(() => {
    const flushOnLeave = () => {
      if (siteContentTimeoutRef.current) {
        clearTimeout(siteContentTimeoutRef.current);
        siteContentTimeoutRef.current = null;
      }
      if (userMediaSaveTimeoutRef.current) {
        clearTimeout(userMediaSaveTimeoutRef.current);
        userMediaSaveTimeoutRef.current = null;
      }
      void persistSiteContentNow(true);
      void persistUserMediaNow(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushOnLeave();
    };
    window.addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushOnLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [persistSiteContentNow, persistUserMediaNow]);

  const requestImmediateCloudSync = useCallback((removedUserItemIds?: string[]) => {
    if (removedUserItemIds?.length) {
      for (const id of removedUserItemIds) {
        if (id) pendingRemovedUserItemIdsRef.current.add(id);
      }
    }
    requestImmediateSyncRef.current = true;
    if (siteContentTimeoutRef.current) {
      clearTimeout(siteContentTimeoutRef.current);
      siteContentTimeoutRef.current = null;
    }
    if (userMediaSaveTimeoutRef.current) {
      clearTimeout(userMediaSaveTimeoutRef.current);
      userMediaSaveTimeoutRef.current = null;
    }
    if (pendingRemovedUserItemIdsRef.current.size > 0 && getAdminSessionToken()) {
      const ids = [...pendingRemovedUserItemIdsRef.current];
      pendingRemovedUserItemIdsRef.current.clear();
      void fetch('/api/admin/remove-user-media-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminSessionToken()}` },
        body: JSON.stringify({ itemIds: ids }),
      }).catch(() => {});
    }
  }, []);

  const deleteUploadedFiles = useCallback(async (
    urls: Array<string | undefined | null>,
    options?: {
      exclude?: {
        postIds?: string[];
        bookIds?: string[];
        photoIds?: string[];
        mediaIds?: string[];
        productIds?: string[];
        websiteIds?: string[];
      };
      freedBytes?: number;
      removedUserItemIds?: string[];
    }
  ) => {
    requestImmediateCloudSync(options?.removedUserItemIds);
    const snap = latestSiteDataRef.current;
    const uniqueUrls = Array.from(new Set(urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)));
    const authToken = getAdminSessionToken() || getUserSessionToken();

    for (const rawUrl of uniqueUrls) {
      if (/^(?:https?:)?\/\//i.test(rawUrl) && !rawUrl.includes('/api/files/')) continue;
      if (/^(?:data:|blob:)/i.test(rawUrl)) continue;
      if (isUrlReferencedElsewhere(rawUrl, options?.exclude, snap)) continue;

      if (rawUrl.startsWith('idb_file_')) {
        await deleteFileFromIndexedDB(rawUrl);
        continue;
      }

      let apiPath = '';
      if (rawUrl.startsWith('/api/files/')) {
        apiPath = rawUrl.split('?')[0];
      } else if (/^https?:\/\/[^/]+\/api\/files\//i.test(rawUrl)) {
        try {
          apiPath = new URL(rawUrl).pathname;
        } catch {}
      }

      if (apiPath && authToken) {
        try {
          const response = await fetch(apiPath, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
          });
          const result = await response.json().catch(() => null);
          if (response.ok && result?.success) {
            if (typeof result.siteContentRevision === 'number') {
              siteContentRevisionRef.current = Math.max(siteContentRevisionRef.current, result.siteContentRevision);
              siteContentConflictRef.current = false;
            }
            if (typeof result.userMediaRevision === 'number') {
              userMediaRevisionRef.current = Math.max(userMediaRevisionRef.current, result.userMediaRevision);
            }
          }
        } catch (err) {
          console.warn('[Storage] Failed deleting file from server:', apiPath, err);
        }
      }
    }

    if (options?.freedBytes && options.freedBytes > 0) {
      addStorageUsage(-options.freedBytes);
    }
  }, [isUrlReferencedElsewhere, requestImmediateCloudSync]);

  const permanentDeleteFromTrash = useCallback((trashId: string) => {
    const target = trashItems.find(t => t.id === trashId);
    if (target?.data) {
      const urls: string[] = [];
      const d = target.data;
      for (const k of ['url', 'thumbnail', 'fileUrl', 'cover', 'src', 'poster']) {
        if (typeof d[k] === 'string') urls.push(d[k]);
      }
      if (Array.isArray(d.images)) urls.push(...d.images);
      if (urls.length > 0) {
        void deleteUploadedFiles(urls, { freedBytes: Number(d.fileSize || 0) || undefined });
      }
    }
    setTrashItems(prev => prev.filter(t => t.id !== trashId));
  }, [trashItems, deleteUploadedFiles]);

  const emptyTrash = useCallback(() => {
    const urls: string[] = [];
    let freed = 0;
    for (const target of trashItems) {
      const d = target?.data;
      if (!d) continue;
      for (const k of ['url', 'thumbnail', 'fileUrl', 'cover', 'src', 'poster']) {
        if (typeof d[k] === 'string') urls.push(d[k]);
      }
      if (Array.isArray(d.images)) urls.push(...d.images);
      freed += Number(d.fileSize || 0) || 0;
    }
    if (urls.length > 0) {
      void deleteUploadedFiles(urls, { freedBytes: freed || undefined });
    }
    setTrashItems([]);
  }, [trashItems, deleteUploadedFiles]);

  // Robust file upload with real XMLHttpRequest progress tracking & local fallback
  const uploadFile = async (file: File): Promise<{ url: string; size: number; name: string }> => {
    startTransfer('upload', file.name);
    const uploadToken = getAdminSessionToken() || getUserSessionToken();
    const authHeaders: Record<string, string> = uploadToken ? { Authorization: `Bearer ${uploadToken}` } : {};
    // Cloudflare's default per-request body ceiling is 100 MB; large files must bypass
    // it using small independently retryable R2 multipart requests.
    if (file.size > 80 * 1024 * 1024) {
      const chunkSize = 8 * 1024 * 1024;
      let uploadId = '', key = '';
      try {
        const created = await fetch('/api/upload/multipart/create', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', size: file.size }) });
        const init = await created.json();
        if (!created.ok || !init.success) throw new Error(init.error || `R2 分块上传初始化失败 (HTTP ${created.status})`);
        uploadId = init.uploadId; key = init.key;
        const parts: Array<{ partNumber: number; etag: string }> = [];
        const count = Math.ceil(file.size / chunkSize);
        for (let i = 0; i < count; i++) {
          const partNumber = i + 1;
          const response = await fetch(`/api/upload/multipart/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', ...authHeaders }, body: file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize)) });
          const result = await response.json();
          if (!response.ok || !result.success || !result.part?.etag) throw new Error(result.error || `第 ${partNumber} 个文件分块上传失败`);
          parts.push(result.part);
          updateTransferPercent(Math.min(96, Math.round(((i + 1) / count) * 96)));
        }
        const completed = await fetch('/api/upload/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ key, uploadId, parts, name: file.name, type: file.type || 'application/octet-stream', size: file.size }) });
        const result = await completed.json();
        if (!completed.ok || !result.success) throw new Error(result.error || 'R2 分块上传未完成');
        addStorageUsage(file.size); updateTransferPercent(100); finishTransfer();
        showToast(`文件《${file.name}》已分块上传至 Cloudflare R2。`, 'success');
        return { url: result.url, size: file.size, name: file.name };
      } catch (error: any) {
        if (uploadId && key) void fetch('/api/upload/multipart/abort', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ key, uploadId }) }).catch(() => undefined);
        finishTransfer(); showToast(`大文件上传失败：${error?.message || '请检查 R2_BUCKET、R2 访问权限和网络'}`, 'error'); throw error;
      }
    }

    return new Promise(async (resolve, reject) => {
      let isCompleted = false;

      const doFallbackLocal = async (cloudFailureReason = '云端存储暂不可用') => {
        if (isCompleted) return;
        isCompleted = true;
        try {
          updateTransferPercent(50);
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileKey = `idb_file_${Date.now()}_${safeName}`;
          await saveFileToIndexedDB(fileKey, file);
          const storedFile = await getFileFromIndexedDB(fileKey);
          if (!storedFile) throw new Error('浏览器本地文件库不可用，文件未能保存');

          addStorageUsage(file.size);
          updateTransferPercent(100);
          finishTransfer();
          showToast(`文件《${file.name}》${cloudFailureReason}，仅保存于本浏览器 IndexedDB；跨设备访问请检查云端存储配置并重新上传。`, 'info');
          resolve({
            url: fileKey,
            size: file.size,
            name: file.name,
          });
        } catch (err: any) {
          finishTransfer();
          showToast(`文件《${file.name}》上传失败：${err?.message || '未知异常'}`, 'error');
          reject(err);
        }
      };

      try {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);
        if (uploadToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${uploadToken}`);
        }
        // Large videos/photos may take minutes on mobile or remote networks. The old
        // 25-second total timeout silently forced successful-looking IndexedDB fallback.
        xhr.timeout = 10 * 60 * 1000;

        const startTime = Date.now();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const percent = Math.min(98, Math.round((event.loaded / event.total) * 100));
            const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
            const speedKB = Math.round((event.loaded / 1024) / elapsedSec);
            const speedStr = speedKB > 1024 ? `${(speedKB / 1024).toFixed(1)} MB/s` : `${speedKB} KB/s`;
            setTransferProgress(prev => ({
              ...prev,
              percent,
              speed: speedStr,
            }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data && data.success && data.url) {
                if (data.storedTarget === 'memory') {
                  doFallbackLocal('服务器只能临时保存在易失内存');
                  return;
                }
                isCompleted = true;
                addStorageUsage(file.size);
                updateTransferPercent(100);
                finishTransfer();
                const targetName = data.storedTarget === 'r2' ? 'Cloudflare R2' : data.storedTarget === 'd1' ? 'Cloudflare D1 存储' : data.storedTarget === 'kv' ? 'Cloudflare KV 临时存储' : data.storedTarget === 'cos' ? '腾讯 COS' : data.storedTarget === 'oss' ? '阿里云 OSS' : data.storedTarget === 's3' ? 'S3 兼容存储' : '配置的云存储';
                showToast(`文件《${file.name}》已成功同步至 ${targetName}！`, 'success');
                resolve({
                  url: data.url,
                  size: file.size,
                  name: file.name,
                });
                return;
              }
            } catch (e) {}
          }
          let reason = `云端上传失败（HTTP ${xhr.status || '未知'}）`;
          try { const errorPayload = JSON.parse(xhr.responseText); if (errorPayload?.error) reason = `云端上传失败：${String(errorPayload.error).slice(0, 100)}`; } catch {}
          doFallbackLocal(reason);
        };

        xhr.onerror = () => {
          doFallbackLocal('云端网络连接失败');
        };

        xhr.ontimeout = () => {
          doFallbackLocal('云端上传超时');
        };

        xhr.send(formData);
      } catch (e) {
        doFallbackLocal('浏览器云端上传请求初始化失败');
      }
    });
  };

  // Build a portable JSON snapshot and upload it to the authenticated WebDAV proxy.
  // Large binary media are deliberately size-limited: browsers and edge runtimes do not
  // provide reliable DAV resumable uploads, so users should back up text/settings first.
  const performBackup = async (scope: 'full' | 'posts' | 'books' | 'media' | 'settings' = 'full') => {
    if (!getAdminSessionToken()) throw new Error('WebDAV 备份需要管理员登录');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `fox3_${scope}_backup_${timestamp}.json`;
    const abortController = new AbortController();
    transferAbortRef.current = abortController;
    startTransfer('backup', fileName);
    const redactSecrets = (value: any): any => {
      if (Array.isArray(value)) return value.map(redactSecrets);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) =>
        /password|passwd|secret|(?:api|access|database|bucket).*key|token/i.test(key) ? [key, ''] : [key, redactSecrets(child)]
      ));
    };
    const backupData: Record<string, any> = { format: 'fox3-backup', version: 1, backupDate: new Date().toISOString(), scope };
    if (scope === 'full' || scope === 'posts') backupData.posts = posts;
    if (scope === 'full' || scope === 'books') backupData.books = books;
    if (scope === 'full' || scope === 'media') { backupData.photos = photos; backupData.media = media; }
    if (scope === 'full' || scope === 'settings') {
      backupData.systemSettings = redactSecrets(systemSettings);
      backupData.themeMode = themeMode;
    }
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    try {
      const uploaded = await uploadWebDavFile(webDavConfig, fileName, blob, updateTransferPercent, abortController.signal);
      setWebDavBackups(prev => [uploaded, ...prev.filter(item => item.name !== uploaded.name)]);
      updateWebDavConfig({ lastBackupTime: Date.now() });
      finishTransfer();
      transferAbortRef.current = null;
    } catch (error: any) {
      finishTransfer();
      transferAbortRef.current = null;
      if (error?.name !== 'AbortError') showToast(error?.message || 'WebDAV 备份失败', 'error', 6000);
      throw error;
    }
  };
  const uploadWebDavRawFile = async (file: File): Promise<void> => {
    if (!getAdminSessionToken()) throw new Error('上传到 WebDAV 需要管理员登录');
    const abortController = new AbortController();
    transferAbortRef.current = abortController;
    startTransfer('backup', file.name);
    try {
      const uploaded = await uploadWebDavFile(webDavConfig, file.name, file, updateTransferPercent, abortController.signal);
      setWebDavBackups(prev => [uploaded, ...prev.filter(item => item.name !== uploaded.name)]);
      finishTransfer();
      transferAbortRef.current = null;
    } catch (error: any) {
      finishTransfer();
      transferAbortRef.current = null;
      if (error?.name !== 'AbortError') showToast(error?.message || `上传 ${file.name} 到 WebDAV 失败`, 'error', 6000);
      throw error;
    }
  };
  const downloadWebDavRawFile = async (fileName: string): Promise<Blob> => {
    if (!getAdminSessionToken()) throw new Error('下载 WebDAV 文件需要管理员登录');
    const abortController = new AbortController();
    transferAbortRef.current = abortController;
    startTransfer('download', fileName);
    try {
      const blob = await downloadWebDavFile(webDavConfig, fileName, updateTransferPercent, abortController.signal);
      finishTransfer();
      transferAbortRef.current = null;
      return blob;
    } catch (error: any) {
      finishTransfer();
      transferAbortRef.current = null;
      if (error?.name !== 'AbortError') showToast(error?.message || `下载 ${fileName} 失败`, 'error', 6000);
      throw error;
    }
  };
  const performRestore = async (backupId: string): Promise<boolean> => {
    const target = webDavBackups.find(item => item.id === backupId || item.name === backupId);
    if (!target) return false;
    if (!/\.json$/i.test(target.name)) {
      showToast('该远端文件不是 fox3 JSON 备份；当前只能恢复本站生成的 JSON 快照。', 'error', 6000);
      return false;
    }
    const abortController = new AbortController();
    transferAbortRef.current = abortController;
    startTransfer('restore', target.name);
    try {
      const blob = await downloadWebDavFile(webDavConfig, target.path || target.name, updateTransferPercent, abortController.signal);
      const data = JSON.parse(await blob.text());
      if (data?.format !== 'fox3-backup' || !Number.isInteger(data.version) || data.version > 1) throw new Error('备份格式或版本不受支持');
      const scope = data.scope;
      if ((scope === 'full' || scope === 'posts') && Array.isArray(data.posts)) setPosts(data.posts);
      if ((scope === 'full' || scope === 'books') && Array.isArray(data.books)) setBooks(data.books);
      if ((scope === 'full' || scope === 'media') && Array.isArray(data.photos)) setPhotos(data.photos);
      if ((scope === 'full' || scope === 'media') && Array.isArray(data.media)) setMedia(data.media);
      if ((scope === 'full' || scope === 'settings') && data.systemSettings) setSystemSettings(prev => ({ ...prev, ...data.systemSettings }));
      if ((scope === 'full' || scope === 'settings') && isGlobalThemeMode(data.themeMode)) setThemeMode(data.themeMode);
      setSyncState(prev => ({ ...prev, status: 'idle', message: '已从远端恢复数据；请执行跨设备同步以持久保存到同步库' }));
      finishTransfer();
      transferAbortRef.current = null;
      return true;
    } catch (error: any) {
      finishTransfer();
      transferAbortRef.current = null;
      if (error?.name !== 'AbortError') showToast(error?.message || '备份恢复失败', 'error', 6000);
      return false;
    }
  };
  const deleteWebDavBackup = async (id: string): Promise<boolean> => {
    const target = webDavBackups.find(item => item.id === id || item.name === id);
    if (!target) return false;
    try {
      await deleteWebDavFile(webDavConfig, target.path || target.name);
      setWebDavBackups(prev => prev.filter(item => item.id !== target.id));
      return true;
    } catch (error: any) {
      showToast(error?.message || '远端删除失败', 'error', 6000);
      return false;
    }
  };
  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        setUsers,
        posts,
        setPosts,
        books,
        setBooks,
        photos,
        setPhotos,
        photoFolders,
        setPhotoFolders,
        media,
        setMedia,
        mails,
        setMails,
        products,
        setProducts,
        orders,
        setOrders,
        chatMessages,
        setChatMessages,
        websites,
        setWebsites,
        webDavBackups,
        setWebDavBackups,
        trashItems,
        moveToTrash,
        restoreFromTrash,
        permanentDeleteFromTrash,
        emptyTrash,
        systemSettings,
        updateSystemSettings,
        emailSettings,
        updateEmailSettings,
        paymentSettings,
        updatePaymentSettings,
        webDavConfig,
        updateWebDavConfig,
        transferProgress,
        startTransfer,
        updateTransferPercent,
        finishTransfer,
        cancelTransfer,
        webDavConnectionState,
        testWebDavConnection,
        refreshWebDavBackups,
        deleteWebDavBackup,
        uploadWebDavRawFile,
        downloadWebDavRawFile,
        multiTransferProgress,
        startMultiTransfer,
        updateMultiTransferProgress,
        finishMultiTransfer,
        toasts,
        showToast,
        dismissToast,
        uploadFile,
        deleteUploadedFiles,
        requestImmediateCloudSync,
        addStorageUsage,
        logout,
        deviceMode,
        setDeviceMode,
        darkMode,
        setDarkMode,
        themeMode,
        setThemeMode,
        viewModes,
        setViewMode,
        syncState,
        triggerManualSync,
        performBackup,
        performRestore,
        toggleBookmark,
        locale,
        setLocale,
        t,
        channelConnected,
        cloudServicesStatus,
        refreshChannelStatus,
        adminUsername,
        adminPassword,
        updateAdminPassword,
        updateAdminUsername,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
