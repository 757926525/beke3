// Core data models for fox3 blog

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: number;
  avatar?: string;
  status: 'active' | 'disabled';
}

export interface Post {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  cover: string;
  author: string;
  views: number;
  likes: number;
  isBookmarked?: boolean;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Book {
  id: string;
  ownerId?: string;
  ownerUsername?: string;
  title: string;
  author: string;
  format: 'EPUB' | 'PDF' | 'TXT' | 'MOBI' | 'AZW3' | string;
  cover: string;
  description: string;
  fileSize: number;
  fileUrl: string;
  displayFilename?: string;
  content?: string; // Text content for in-browser reading
  progress?: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface PhotoFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Photo {
  id: string;
  ownerId?: string;
  ownerUsername?: string;
  title: string;
  url: string;
  originalFilename?: string;
  thumbnail?: string;
  category: string;
  folderId?: string; // photo folder/album id
  folderName?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  description?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface MediaItem {
  id: string;
  ownerId?: string;
  ownerUsername?: string;
  type: 'audio' | 'video';
  title: string;
  originalFilename?: string;
  artist: string;
  src: string;
  cover: string;
  duration: string;
  fileSize?: number;
  uploadedAt?: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface MailMessage {
  id: string;
  folder: 'inbox' | 'sent' | 'trash';
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
  isStarred: boolean;
  isCodeVerify?: boolean;
  code?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  stock: number;
  tags?: string[];
  showcaseId?: string;
  createdAt: number;
  updatedAt: number;
}

export type OrderStatus = 'unpaid' | 'paid' | 'shipped' | 'completed' | 'refunded';

export interface Order {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  quantity: number;
  totalPrice: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  paymentMethod: 'paypal' | 'worldfirst' | 'wechat' | 'alipay' | 'stripe' | 'usdt' | 'unionpay' | 'pending';
  status: OrderStatus;
  trackingNumber?: string;
  carrier?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'customer' | 'admin';
  userName: string;
  userEmail?: string;
  message: string;
  createdAt: number;
}

export interface WebDavBackupItem {
  id: string;
  name: string;
  size: number;
  updatedAt: number;
  type: 'full' | 'posts' | 'books' | 'media' | 'settings';
  path: string;
}

export interface WebDavConfig {
  enabled: boolean;
  provider: 'nutstore' | 'generic'; // WebDAV 提供商
  serverUrl: string;
  port?: number | string; // WebDAV 端口（默认 443）
  username: string;
  password: string;
  backupPath: string;
  lastBackupTime?: number;
}

export interface EmailSettings {
  enabled: boolean;
  provider: 'resend' | 'sendgrid' | 'sendcloud' | 'mailgun' | 'ses' | 'brevo' | 'postmark' | 'smtp' | 'custom';
  apiKey: string;
  apiUser?: string;
  apiEndpoint: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: 'ssl' | 'starttls';
  smtpUser: string;
  smtpPass: string;
  senderEmail: string;
  verificationCodeLength: number;
  verificationEmailSubject: string;
  verificationEmailTemplate: string;
  autoReplyEnabled: boolean;
  rateLimitEnabled: boolean;
  maxDailyEmails: number;
  inboundMethod: 'cf_routing' | 'webhook' | 'imap_pop3';
  cfEmailRouting: {
    enabled: boolean;
    routingAddress: string;
    forwardTo: string;
    webhookUrl: string;
  };
  imapConfig?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    tls: boolean;
  };
}

export interface StorageConfig {
  databaseType: 'd1' | 'supabase' | 'rest' | 'local';
  databaseUrl?: string;
  databaseKey?: string;
  bucketType: 'r2' | 's3' | 'cos' | 'oss' | 'webdav' | 'local';
  bucketEndpoint?: string;
  bucketName?: string;
  bucketAccessKey?: string;
  bucketSecretKey?: string;
  bucketPublicUrl?: string;
  kvType: 'cf_kv' | 'local' | 'redis';
  kvEndpoint?: string;
  kvToken?: string;
}

export type GlobalThemeMode =
  | 'modern'
  | 'win98'
  | 'mac-classic'
  | 'cyberpunk'
  | 'nordic'
  | 'leather'
  | 'blueprint'
  | 'retro'
  | 'aurora-glass'
  | 'neo-brutal'
  | 'soft-pastel'
  | 'pearl-mist'
  | 'sage-atelier'
  | 'terracotta'
  | 'coastal-blue'
  | 'velvet-plum'
  | 'editorial';
export type DeviceViewMode = 'responsive' | 'mobile';
export type MobileThemeMode =
  | 'aurora-mobile'
  | 'cream-editorial'
  | 'obsidian-luxe'
  | 'sakura-glass'
  | 'emerald-botanical'
  | 'cyber-prism';

export interface SystemSettings {
  siteName: string;
  headerTagline?: string;
  shopCategories?: string[];
  themeColor: string;
  customPaletteBg?: string;
  fullBackgroundUrl?: string;
  avatarUrl?: string;
  heroIntroImage?: string; // Panoramic single hero background image
  heroBadge?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  transparentCards: boolean; // Semi-transparent glass card showing site background
  bottomButtonsEnabled: boolean; // Global master switch for floating bottom buttons (back-to-top, shortcuts)
  hideNonBlogForGuests: boolean;
  emailRegistrationOnly: boolean;
  allowRegistration: boolean;
  allowUserMediaManagement?: boolean;
  allowPublicSitesAccess?: boolean;
  totalCapacityBytes: number;
  usedCapacityBytes: number;
  storageConfig: StorageConfig;
  autoSync: boolean;
  syncIntervalSeconds: number;
  globalTheme: GlobalThemeMode; // 'modern' or 'retro'
  deviceView: DeviceViewMode; // 'responsive' or 'mobile'
  mobileTheme?: MobileThemeMode;
  timezone?: string; // Timezone setting, e.g. 'Asia/Shanghai', 'UTC', 'America/New_York'
  fontFamily?: 'default' | 'kaiti' | 'youyuan' | 'qinzhuanshu' | 'custom';
  customFontName?: string;
  customFontUrl?: string;
  uploadedThemeName?: string;
}

export interface PaymentSettings {
  paypal: {
    enabled: boolean;
    clientId: string;
    secret: string;
    mode: 'sandbox' | 'live';
  };
  worldfirst: {
    enabled: boolean;
    partnerId: string;
    privateKey: string;
  };
  wechatPay: {
    enabled: boolean;
    appId: string;
    mchId: string;
    apiKey: string;
  };
  alipay: {
    enabled: boolean;
    appId: string;
    privateKey: string;
    alipayPublicKey: string;
  };
  stripe: {
    enabled: boolean;
    publishableKey: string;
    secretKey: string;
  };
  usdt: {
    enabled: boolean;
    network: 'TRC20' | 'ERC20';
    walletAddress: string;
  };
  unionpay: {
    enabled: boolean;
    merId: string;
    secureKey: string;
  };
}

export type ViewMode = 'big' | 'medium' | 'small' | 'original';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

export interface MultiTransferProgress {
  active: boolean;
  type: 'upload' | 'download' | 'backup' | 'restore';
  currentFileName: string;
  currentIndex: number;
  totalCount: number;
  overallPercent: number;
  itemPercent: number;
  speed?: string;
  totalBytes?: number;
  transferredBytes?: number;
}

export interface WebSiteItem {
  id: string;
  title: string;
  url: string;
  poster: string;
  description: string;
  createdAt: number;
  updatedAt?: number;
}

export interface TrashItem {
  id: string;
  originId: string;
  originType: 'post' | 'book' | 'photo' | 'media' | 'mail' | 'chat' | 'product' | 'order' | 'website';
  title: string;
  preview?: string;
  deletedAt: number;
  data: any;
}
