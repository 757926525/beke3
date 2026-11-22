import { get, set, del } from 'idb-keyval';
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
} from '../types';

export const STORAGE_KEYS = {
  CURRENT_USER: 'fox3_current_user',
  USERS: 'fox3_users',
  POSTS: 'fox3_posts',
  BOOKS: 'fox3_books',
  PHOTOS: 'fox3_photos',
  MEDIA: 'fox3_media',
  MAILS: 'fox3_mails',
  PRODUCTS: 'fox3_products',
  ORDERS: 'fox3_orders',
  WEBSITES: 'fox3_websites',
  CHAT_MESSAGES: 'fox3_chat_messages',
  SYSTEM_SETTINGS: 'fox3_system_settings',
  EMAIL_SETTINGS: 'fox3_email_settings',
  PAYMENT_SETTINGS: 'fox3_payment_settings',
  LOCALE: 'fox3_locale',
  WEBDAV_CONFIG: 'fox3_webdav_config',
  WEBDAV_BACKUPS: 'fox3_webdav_backups',
  VIEW_MODES: 'fox3_view_modes',
  ADMIN_USERNAME: 'fox3_admin_username',
  ADMIN_PASSWORD: 'fox3_admin_password',
  USER_PASSWORDS: 'fox3_user_passwords',
  TRANSLATE_CONFIG: 'fox3_translate_config',
};

// Safe LocalStorage Reader / Writer
export const loadLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[fox3 Storage] Failed reading ${key} from localStorage:`, e);
    return defaultValue;
  }
};

export const saveLocalStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[fox3 Storage] Failed saving ${key} to localStorage:`, e);
  }
};

// IndexedDB robust file storage
export const saveFileToIndexedDB = async (fileKey: string, blob: Blob | string): Promise<string> => {
  try {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      await set(fileKey, blob);
      return fileKey;
    }
    return typeof blob === 'string' ? blob : URL.createObjectURL(blob);
  } catch (err) {
    console.warn('[fox3 IDB] IndexedDB save error, using fallback', err);
    return typeof blob === 'string' ? blob : URL.createObjectURL(blob);
  }
};

export const getFileFromIndexedDB = async (fileKey: string): Promise<Blob | string | null> => {
  try {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      const val = await get(fileKey);
      return val || null;
    }
    return null;
  } catch (err) {
    return null;
  }
};

export const deleteFileFromIndexedDB = async (fileKey: string): Promise<void> => {
  try {
    if (fileKey && typeof window !== 'undefined' && 'indexedDB' in window) {
      await del(fileKey);
    }
  } catch (err) {
    console.warn('[fox3 IDB] IndexedDB delete error:', err);
  }
};

// Convert indexedDB key, data URL, or remote URL into a valid URL for displaying/downloading
export const resolveFileUrl = async (urlOrKey: string): Promise<string> => {
  if (!urlOrKey) return '';
  // Data URLs, HTTP/HTTPS URLs, or root-relative paths can be used directly
  if (urlOrKey.startsWith('data:') || urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://') || urlOrKey.startsWith('/')) {
    return urlOrKey;
  }
  // IndexedDB persistent key
  if (urlOrKey.startsWith('idb_file_')) {
    const blob = await getFileFromIndexedDB(urlOrKey);
    if (blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
    if (typeof blob === 'string') return blob;
  }
  return urlOrKey;
};

// Default initial data for fresh deployment
export const DEFAULT_SETTINGS: SystemSettings = {
  siteName: 'fox3 博客',
  headerTagline: 'CLOUDFLARE NATIVE • FOX3',
  shopCategories: ['实体周边', '电子书', '数码配件', '服饰鞋包', '家居生活', '文创文具', '虚拟商品', '课程培训', '会员服务', '软件工具', '摄影器材', '礼品收藏', '食品饮品', '咨询服务'],
  themeColor: '#0ea5e9', // Sky blue modern accent
  customPaletteBg: '#f8fafc',
  fullBackgroundUrl: '',
  avatarUrl: '/images/hero-default.jpg',
  heroIntroImage: '/images/hero-default.jpg', // User uploaded panoramic hero
  heroBadge: '✨ 数字化极速智库 & 全栈现代博客',
  heroTitle: '探索数字世界与全栈极简之美',
  heroSubtitle: '融合 Cloudflare D1/R2/KV 与 WebDAV 容灾备份的下一代多终端响应式博客平台',
  transparentCards: false,
  bottomButtonsEnabled: false,
  hideNonBlogForGuests: false,
  emailRegistrationOnly: false,
  allowRegistration: true,
  allowUserMediaManagement: false,
  allowPublicSitesAccess: false,
  totalCapacityBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  usedCapacityBytes: 0, // Default starts at zero as requested
  storageConfig: {
    databaseType: 'd1',
    bucketType: 'r2',
    kvType: 'cf_kv',
  },
  autoSync: false,
  syncIntervalSeconds: 600,
  globalTheme: 'modern',
  deviceView: 'responsive',
  mobileTheme: 'aurora-mobile',
  fontFamily: 'default',
  customFontName: '',
  customFontUrl: '',
};

export const DEFAULT_ADMIN: User = {
  id: 'user_fox_admin',
  username: 'fox',
  email: 'service@whitefox.blog',
  role: 'admin',
  createdAt: Date.now(),
  avatar: '/images/hero-default.jpg',
  status: 'active',
};

export const DEFAULT_POSTS: Post[] = [
  {
    id: 'post-1',
    title: 'fox3 数据存储位置与部署边界',
    summary: '说明浏览器本机数据、Cloudflare D1/R2/KV 的实际用途，以及未绑定服务时的限制。',
    content: `# fox3 数据存储位置与部署边界

fox3 是以浏览器端应用为主的博客与数字资料管理前端。不同类型的数据不都写入同一个云数据库；云端能力必须根据项目代码配置 Pages Functions 和 Cloudflare 绑定。

## 实际存储

- **浏览器 localStorage / IndexedDB**：文章、书籍、照片/媒体记录、站内邮件列表、商品/订单、聊天、系统设置、邮箱配置以及本机文件缓存。邮件密码/API Key 会按设置保存在配置该浏览器的本机，未加密，也不会放入共享同步载荷。
- **Cloudflare D1**：注册账户及 PBKDF2 密码哈希、验证码与限流记录、管理员手动共享同步 JSON；没有 R2 时也可能作为文件回退。
- **Cloudflare R2**：远程上传文件对象的首选存储。
- **Cloudflare KV**：兼容/短期回退，不是主内容数据库；其日写入额度可能耗尽。
- **Worker 内存**：仅最后一级临时回退，实例重启或请求被调度到其他实例时会丢失，不能视为持久化或容灾。

## 部署限制

纯静态托管只有前端文件，不会自动运行 Pages Functions，也不会创建 D1/R2/KV 绑定。因此注册、验证码邮件、管理员后台发信、共享同步和远程文件服务依赖对应后端部署；未配置时请按页面错误处理，不要假设云端写入成功。

*本文为项目内说明；详细绑定与数据表见仓库 README。*`,
    category: '技术架构',
    tags: ['Cloudflare', 'D1', 'R2', 'fox3'],
    cover: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
    author: 'fox',
    views: 1280,
    likes: 88,
    isBookmarked: false,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'post-2',
    title: '从零部署 fox3：Cloudflare Pages 一键拉取与快速绑定全攻略',
    summary: '本文详细介绍如何在 Cloudflare Pages 绑定 GitHub/GitLab 仓库实现全自动 CI/CD 构建，并在控制台无缝绑定 D1 数据库与 R2 存储桶。',
    content: `# Cloudflare Pages 部署指引

通过 Cloudflare 部署 fox3 是最简单也是最推荐的方式：

1. 打开 Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages**。
2. 选择 **Connect to Git** 并关联您的本仓库。
3. 构建配置：
   - 框架预设：\`Vite\`
   - 构建命令：\`npm run build\`
   - 构建输出目录：\`dist\`
4. 部署成功后，在 **Settings** -> **Functions** -> **D1 / R2 / KV Bindings** 进行绑定即可。`,
    category: '部署指南',
    tags: ['部署', 'Cloudflare Pages', '指南'],
    cover: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    author: 'fox',
    views: 960,
    likes: 64,
    isBookmarked: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'post-3',
    title: '全站多通道邮件中枢与 WebDAV 自动灾备实践',
    summary: '深入探究内置邮件通知验证码、Cloudflare Email Routing 路由保存以及 WebDAV 网盘备份恢复的技术实现。',
    content: `# 邮件与备份容灾体系

邮件区支持：
- 第三方 API（Resend, SendGrid）与 SMTP 配置保存；
- 注册邮箱验证码自动生成与智能回复；
- Cloudflare Email Routing 无缝转发与后台实时回信；
- 3,000 封智能阈值风控提醒。

备份区支持：
- WebDAV 直连验证；
- 全景可视化文件列表与一键灾难恢复。`,
    category: '系统运维',
    tags: ['邮件', 'WebDAV', '容灾'],
    cover: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80',
    author: 'fox',
    views: 742,
    likes: 49,
    isBookmarked: false,
    createdAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 1,
  }
];

export const DEFAULT_BOOKS: Book[] = [
  {
    id: 'book-1',
    title: '黑客与画家 (Hackers & Painters)',
    author: 'Paul Graham',
    format: 'EPUB',
    cover: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
    description: '硅谷创业之父保罗·格雷厄姆的文集，探讨黑客精神、财富创造与程序语言设计。',
    fileSize: 2450000,
    fileUrl: '/books/hackers-and-painters.epub',
    content: `第一章 为什么书呆子不受欢迎\n\n如果你在读高中，或者不久前刚高中毕业，你可能会觉得生活里最重要的事情就是受欢迎程度……\n\n黑客是真正的创造者，就像画家、作曲家或建筑师。他们用计算机编程语言作为画布与颜料，把心中的构想一步步具象化。\n\n伟大的软件往往由极具审美与独立思考能力的人编写完成。\n\n第二章 黑客与画家\n\n黑客与画家有极大的相似之处。两者都是创造者，试图创造出美丽而有价值的事物。他们必须动手实践，必须从空白画布开始，一笔一笔地将想象转变为现实。`,
    progress: 35,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'book-2',
    title: '设计心理学 (The Design of Everyday Things)',
    author: '唐·诺曼 (Don Norman)',
    format: 'PDF',
    cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80',
    description: '日常用品的设计哲学，如何通过示能与意符减少人机交互中的摩擦。',
    fileSize: 8400000,
    fileUrl: '/books/design-of-everyday-things.pdf',
    content: `第一章 日用品中的精神病学\n\n好的设计其实很难被注意到，因为它们顺应人的直觉，工作得如此自然，以至于我们根本不需要思考。\n\n糟糕的设计却无处不在，例如推拉门没有明确的把手方向指示，让无数人陷入尴尬。\n\n示能（Affordance）与意符（Signifier）构成了所有优秀设计的基石。在设计数字系统或实体工具时，设计师的职责就是清晰地呈现意图与操作反馈。`,
    progress: 60,
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'book-3',
    title: '瓦尔登湖 (Walden)',
    author: '亨利·戴维·梭罗',
    format: 'TXT',
    cover: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80',
    description: '在瓦尔登湖畔独居两年的思考，关于极简生活、自然与内心的沉淀。',
    fileSize: 620000,
    fileUrl: '/books/walden.txt',
    content: `我步入丛林，因为我希望生活得有意义，我希望深入生活，吸取生活中的所有精华，把非生活的一切都消灭殆尽，免得到我临死的时候，才发现自己根本没有生活过。\n\n大多数人都生活在平静的绝望中。所谓听天由命，不过是无可奈何的习惯。我们应该简化生活，简化我们的日程与欲望，让灵魂在纯粹中苏醒。`,
    progress: 15,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
  }
];

export const DEFAULT_PHOTOS: Photo[] = [
  {
    id: 'photo-1',
    title: '阿尔卑斯的晨光',
    category: '风光摄影',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    description: '清晨第一缕阳光洒落在雪峰之上',
    createdAt: Date.now() - 86400000 * 6,
    updatedAt: Date.now() - 86400000 * 6,
  },
  {
    id: 'photo-2',
    title: '赛博朋克雨夜街头',
    category: '城市街头',
    url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1200&q=80',
    description: '霓虹倒影在湿润的沥青路面',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'photo-3',
    title: '极地深处的光芒',
    category: '自然奇观',
    url: 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=1200&q=80',
    description: '漫天舞动的绿色极光与宁静夜空',
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 4,
  }
];

export const DEFAULT_MEDIA: MediaItem[] = [
  {
    id: 'media-1',
    type: 'audio',
    title: 'Horizon of Dawn (晨曦地平线)',
    artist: 'WhiteFox Acoustic Ensemble',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration: '06:12',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'media-2',
    type: 'video',
    title: '极地自然纪录短片 (Big Buck Bunny Demo)',
    artist: 'Open Source Media Lab',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    duration: '09:56',
    cover: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=800&q=80',
    createdAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 1,
  }
];

export const DEFAULT_MAILS: MailMessage[] = [
  {
    id: 'mail-1',
    folder: 'inbox',
    sender: 'user@example.com',
    recipient: 'service@whitefox.blog',
    subject: '关于 fox3 博客与 WebDAV 同步的体验咨询',
    body: '博主您好！非常喜欢您的博客架构，请问 WebDAV 是否支持自动定时灾备？期待回复！',
    date: '2025-05-20 14:32:00',
    read: true,
    isStarred: true,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'mail-2',
    folder: 'inbox',
    sender: 'newuser@163.com',
    recipient: 'service@whitefox.blog',
    subject: 'fox3 博客注册验证码通知',
    body: '欢迎加入 fox3 博客社区！您的动态身份验证码为：【668822】。有效期 10 分钟，请妥善保管。',
    date: '2025-05-20 16:10:00',
    read: false,
    isStarred: false,
    isCodeVerify: true,
    code: '668822',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'mail-3',
    folder: 'sent',
    sender: 'service@whitefox.blog',
    recipient: 'user@example.com',
    subject: 'Re: 关于 fox3 博客与 WebDAV 同步的体验咨询',
    body: '您好，fox3 在后台设置中配置好 WebDAV 后，支持随时一键全站结构化数据备份，并可在历史备份库中随时回滚恢复！',
    date: '2025-05-20 17:05:00',
    read: true,
    isStarred: false,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  }
];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'fox3 深度定制全栈部署极速交付包',
    description: '包含 Cloudflare D1/R2/KV 自动化绑定脚本、独立域名配置咨询以及全站备份恢复方案实施指导。',
    price: 99.00,
    images: [
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80'
    ],
    category: '数字化产品',
    stock: 99,
    tags: ['全栈', 'Cloudflare', '咨询'],
    showcaseId: 'showcase-main',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'prod-2',
    name: '极简机械键盘定制键帽套装 (白狐限定版)',
    description: 'PBT 热升华工艺，人体工学校正高度，附送白狐专属定制个性键帽与拔键器。',
    price: 199.00,
    images: [
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=800&q=80'
    ],
    category: '实体周边',
    stock: 25,
    tags: ['数码周边', '定制', '现货'],
    showcaseId: 'showcase-hardware',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  }
];

export const DEFAULT_ORDERS: Order[] = [
  {
    id: 'ord-1001',
    productId: 'prod-1',
    productName: 'fox3 深度定制全栈部署极速交付包',
    productImage: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80',
    quantity: 1,
    totalPrice: 99.00,
    customerName: '李先生',
    customerEmail: 'customer@163.com',
    customerPhone: '13800138000',
    customerAddress: '广东省深圳市南山区高新南九道软件产业基地 4 栋',
    paymentMethod: 'wechat',
    status: 'paid',
    trackingNumber: 'SF1029384756',
    carrier: '顺丰速运',
    createdAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'ord-1002',
    productId: 'prod-2',
    productName: '极简机械键盘定制键帽套装 (白狐限定版)',
    productImage: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
    quantity: 2,
    totalPrice: 398.00,
    customerName: '王女士',
    customerEmail: 'wang@outlook.com',
    customerPhone: '13911223344',
    customerAddress: '上海市浦东新区张江高科技园区碧波路 88 号',
    paymentMethod: 'alipay',
    status: 'unpaid',
    createdAt: Date.now() - 3600000 * 5,
  }
];

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  paypal: {
    enabled: true,
    clientId: 'paypal_client_id_demo_888',
    secret: '********',
    mode: 'sandbox',
  },
  worldfirst: {
    enabled: true,
    partnerId: 'wf_partner_9988',
    privateKey: '********',
  },
  wechatPay: {
    enabled: true,
    appId: 'wx8888888888888888',
    mchId: '1600000000',
    apiKey: '********',
  },
  alipay: {
    enabled: true,
    appId: '2021000000000000',
    privateKey: '********',
    alipayPublicKey: '********',
  },
  stripe: {
    enabled: true,
    publishableKey: 'pk_test_fox3_demo_key',
    secretKey: '********',
  },
  usdt: {
    enabled: true,
    network: 'TRC20',
    walletAddress: 'TYDzsXDvGhnqkdRmWK992xJpQyJKeS1K8q',
  },
  unionpay: {
    enabled: true,
    merId: '777290058110048',
    secureKey: '********',
  }
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  enabled: true,
  provider: 'resend',
  apiKey: '',
  apiUser: '',
  apiEndpoint: 'https://api.resend.com/emails',
  smtpHost: 'smtp.resend.com',
  smtpPort: 465,
  smtpSecurity: 'ssl',
  smtpUser: 'resend',
  smtpPass: '',
  senderEmail: 'service@whitefox.blog',
  verificationCodeLength: 6,
  verificationEmailSubject: '【fox3 博客】注册验证码：{{code}}',
  verificationEmailTemplate: '您好 {{username}}，\n\n您正在注册 fox3 博客账号，验证码为：{{code}}。\n验证码 10 分钟内有效，请勿向他人透露。\n\n如果不是您本人操作，请忽略此邮件。',
  autoReplyEnabled: true,
  rateLimitEnabled: true,
  maxDailyEmails: 3000,
  inboundMethod: 'cf_routing',
  cfEmailRouting: {
    enabled: true,
    routingAddress: 'contact@whitefox.blog',
    forwardTo: 'admin@whitefox.blog',
    webhookUrl: '/api/mail/webhook',
  },
  imapConfig: {
    host: 'imap.whitefox.blog',
    port: 993,
    user: 'service@whitefox.blog',
    pass: '********',
    tls: true,
  }
};

export const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  enabled: true,
  provider: 'nutstore',
  serverUrl: 'https://dav.jianguoyun.com/dav/',
  username: 'fox_backup@jianguoyun.com',
  password: '********',
  backupPath: '/fox3_backup/',
  lastBackupTime: 0,
};

export const DEFAULT_WEBDAV_BACKUPS: WebDavBackupItem[] = [];

export const DEFAULT_WEBSITES: WebSiteItem[] = [
  {
    id: 'site-default-1',
    title: '白狐图床与文件分发中心',
    url: 'https://img.001315.xyz/',
    poster: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
    description: '官方高速图床与免流分发站点，支持各类高清图片、海报与素材的全球极速分发与直链引用。',
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 7,
  }
];
