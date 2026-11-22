import { capturePayPalOrder, createPayment, queryPaymentStatus, verifyPaymentWebhook, refundPayment, type PaymentProvider } from './payment-providers';

type UserIdentity = { id: string; username: string };
type MailSender = (to: string, subject: string, text: string, html: string) => Promise<{ success: boolean; error?: string }>;
type CommerceAuth = {
  isAdmin: (request: Request) => Promise<boolean>;
  getUser: (request: Request) => Promise<UserIdentity | null>;
  sendMail: MailSender;
  defaultAdminEmail?: string;
};

const PAGE_KEYS = ['refund', 'privacy', 'terms', 'contact'] as const;
const LEGAL_DEFAULTS: Record<(typeof PAGE_KEYS)[number], string> = {
  refund: '退款政策\n\n请在此说明订单取消、退款申请入口、适用条件、处理时限、原支付渠道退款规则及不可退款情形。\n\n请站长根据实际商品、支付服务商规则和适用法律审阅后发布。',
  privacy: '隐私政策\n\n请在此说明收集的账户、订单、收货、客服和技术信息，处理目的、保存期限、服务商共享、用户权利、删除/更正请求方式以及联系方式。\n\n请站长根据实际数据处理活动和适用法律审阅后发布。',
  terms: '服务条款\n\n请在此说明网站和商品服务范围、账户责任、价格和订单规则、付款以服务端验签结果为准、交付/发货、知识产权、责任限制、争议处理和条款变更。\n\n请站长根据实际业务和适用法律审阅后发布。',
  contact: '联系方式\n\n请填写真实有效的运营主体/商户名称、客服邮箱、联系电话、服务时间、通信地址以及售后与投诉渠道。不要在此填写支付密钥。',
};

function json(data: unknown, status = 200, headers = new Headers()): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set('Content-Type', 'application/json; charset=utf-8');
  resultHeaders.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: resultHeaders });
}
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function uuid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}
async function ensureCommerceTables(db: any): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_orders (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    username TEXT NOT NULL,
    productId TEXT NOT NULL,
    productName TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unitAmountMinor INTEGER NOT NULL,
    amountMinor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    paymentProvider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    providerOrderId TEXT,
    providerPaymentId TEXT,
    paymentUrl TEXT,
    customerName TEXT NOT NULL,
    customerPhone TEXT NOT NULL,
    customerEmail TEXT NOT NULL,
    shippingAddress TEXT NOT NULL,
    couponCode TEXT NOT NULL DEFAULT '',
    discountMinor INTEGER NOT NULL DEFAULT 0,
    trackingNumber TEXT,
    carrier TEXT,
    refundId TEXT,
    refundReason TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    paidAt INTEGER,
    shippedAt INTEGER,
    refundedAt INTEGER,
    deletedAt INTEGER
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_orders_user_created ON fox3_orders(userId, createdAt DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_orders_status_created ON fox3_orders(status, createdAt DESC)').run();
  // Older D1 deployments may have run commerce migration 0002 but not 0003.
  // Add the nullable soft-delete column idempotently so order, chat and policy
  // requests remain usable while the formal migration is being applied.
  const orderColumns = await db.prepare('PRAGMA table_info(fox3_orders)').all();
  if (!(orderColumns?.results || []).some((column: any) => column.name === 'deletedAt')) {
    await db.prepare('ALTER TABLE fox3_orders ADD COLUMN deletedAt INTEGER').run();
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_orders_deleted ON fox3_orders(deletedAt, createdAt DESC)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_payment_events (
    eventId TEXT NOT NULL,
    provider TEXT NOT NULL,
    orderId TEXT NOT NULL,
    receivedAt INTEGER NOT NULL,
    PRIMARY KEY (provider, eventId)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_conversations (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  )`).run();
  const chatColumns = await db.prepare('PRAGMA table_info(fox3_conversations)').all();
  if (!(chatColumns?.results || []).some((column: any) => column.name === 'deletedAt')) {
    await db.prepare('ALTER TABLE fox3_conversations ADD COLUMN deletedAt INTEGER').run();
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_conversations_deleted_updated ON fox3_conversations(deletedAt, updatedAt DESC)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_chat_messages (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    senderId TEXT NOT NULL,
    senderRole TEXT NOT NULL,
    senderName TEXT NOT NULL,
    message TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    readAt INTEGER
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_chat_messages_conversation ON fox3_chat_messages(conversationId, createdAt)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_notifications (
    id TEXT PRIMARY KEY,
    recipientRole TEXT NOT NULL,
    recipientId TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    refId TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    readAt INTEGER
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_notifications_recipient ON fox3_notifications(recipientRole, recipientId, readAt, createdAt DESC)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_legal_pages (
    pageKey TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_payment_preferences (
    id TEXT PRIMARY KEY,
    adminEmail TEXT NOT NULL DEFAULT '',
    notifyEmail INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL
  )`).run();
}
async function addNotification(db: any, recipientRole: 'admin' | 'user', recipientId: string, kind: string, title: string, body: string, refId: string, id?: string): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO fox3_notifications
    (id, recipientRole, recipientId, kind, title, body, refId, createdAt, readAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(id || uuid('notice'), recipientRole, recipientId, kind, title.slice(0, 180), body.slice(0, 1200), refId.slice(0, 200), Date.now()).run();
}
function rowToOrder(row: any, admin = false): any {
  const order = {
    id: String(row.id), userId: String(row.userId), username: String(row.username),
    productId: String(row.productId), productName: String(row.productName),
    quantity: Number(row.quantity), unitAmountMinor: Number(row.unitAmountMinor),
    amountMinor: Number(row.amountMinor), currency: String(row.currency || 'CNY'),
    paymentProvider: String(row.paymentProvider), status: String(row.status),
    paymentUrl: row.paymentUrl || undefined, customerName: String(row.customerName || ''),
    customerPhone: String(row.customerPhone || ''), customerEmail: String(row.customerEmail || ''),
    shippingAddress: String(row.shippingAddress || ''), couponCode: String(row.couponCode || ''),
    discountMinor: Number(row.discountMinor || 0), trackingNumber: row.trackingNumber || undefined,
    carrier: row.carrier || undefined, refundReason: row.refundReason || undefined,
    createdAt: Number(row.createdAt || 0), updatedAt: Number(row.updatedAt || 0),
    paidAt: row.paidAt ? Number(row.paidAt) : undefined,
    shippedAt: row.shippedAt ? Number(row.shippedAt) : undefined,
    refundedAt: row.refundedAt ? Number(row.refundedAt) : undefined,
  };
  if (!admin) {
    delete (order as any).userId;
    delete (order as any).username;
    delete (order as any).paymentUrl;
  }
  return order;
}
async function loadOrder(db: any, id: string): Promise<any | null> {
  return db.prepare('SELECT * FROM fox3_orders WHERE id = ? LIMIT 1').bind(id).first();
}
async function notifyPaid(db: any, row: any, sendMail: MailSender, defaultEmail = ''): Promise<void> {
  await addNotification(db, 'admin', '', 'payment_succeeded', '新订单已支付', `${row.username} 已支付订单 ${row.id}，金额 ${(Number(row.amountMinor) / 100).toFixed(2)} ${row.currency}。`, String(row.id), `payment-paid:${row.id}`);
  const prefs = await db.prepare('SELECT adminEmail, notifyEmail FROM fox3_payment_preferences WHERE id = ?').bind('default').first();
  const to = text(prefs?.adminEmail, 254) || text(defaultEmail, 254);
  if (to) {
    const subject = `订单已支付：${row.id}`;
    const body = `用户 ${row.username} 的订单 ${row.id} 已由支付服务端验证为到账。\n商品：${row.productName}\n数量：${row.quantity}\n金额：${(Number(row.amountMinor) / 100).toFixed(2)} ${row.currency}\n请登录管理页面处理发货。`;
    try { await sendMail(to, subject, body, `<div style="white-space:pre-wrap">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`); } catch {}
  }
}
async function notifyOrderCreated(db: any, row: any, sendMail: MailSender, defaultEmail = ''): Promise<void> {
  const pending = row.status === 'pending';
  const title = pending ? '新订单待支付' : '新订单未支付';
  const body = `订单状态：${pending ? '未支付 / 待支付' : '未支付 / 支付初始化失败'}\n订单号：${row.id}\n用户：${row.username}\n商品：${row.productName}\n数量：${row.quantity}\n金额：${(Number(row.amountMinor) / 100).toFixed(2)} ${row.currency}\n请登录管理页面查看订单。`;
  await addNotification(db, 'admin', '', pending ? 'order_unpaid' : 'order_payment_failed', title, body, String(row.id), `order-created:${row.id}`);
  const prefs = await db.prepare('SELECT adminEmail FROM fox3_payment_preferences WHERE id = ?').bind('default').first();
  const to = text(prefs?.adminEmail, 254) || text(defaultEmail, 254);
  if (to) try { await sendMail(to, `${title}：${row.id}`, body, `<div style="white-space:pre-wrap">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`); } catch (error) { console.warn('[Commerce] order email delivery failed:', String((error as any)?.message || error).slice(0, 160)); }
}
async function applyWebhook(db: any, provider: string, event: any, sendMail: MailSender, defaultEmail = ''): Promise<Response> {
  if (!event || !event.eventId || (!event.orderId && !event.paymentId)) return new Response('Invalid event', { status: 400 });
  const row = event.orderId ? await loadOrder(db, String(event.orderId)) : null;
  const mappedRow = row || await db.prepare('SELECT * FROM fox3_orders WHERE providerOrderId = ? OR providerPaymentId = ? LIMIT 1')
    .bind(String(event.orderId || ''), String(event.paymentId || '')).first();
  if (!mappedRow || String(mappedRow.paymentProvider) !== provider) return new Response('Order not found', { status: 404 });
  const order = mappedRow;
  if (event.status === 'paid') {
    if (Number(event.amountMinor) !== Number(order.amountMinor) || String(event.currency || '').toUpperCase() !== String(order.currency).toUpperCase()) {
      console.error(`[Payment] Verified webhook amount mismatch for order ${order.id}`);
      return new Response('Order amount or currency mismatch', { status: 400 });
    }
  }
  if (event.status === 'refunded' && event.amountMinor != null && Number(event.amountMinor) !== Number(order.amountMinor)) {
    console.error(`[Payment] Verified refund amount mismatch for order ${order.id}`);
    return new Response('Refund amount mismatch', { status: 400 });
  }
  const inserted = await db.prepare(`INSERT OR IGNORE INTO fox3_payment_events (eventId, provider, orderId, receivedAt) VALUES (?, ?, ?, ?)`)
    .bind(`${provider}:${String(event.eventId).slice(0, 240)}`, provider, String(order.id), Date.now()).run();
  if (!Number(inserted?.meta?.changes || 0)) return new Response('OK', { status: 200 });
  const now = Date.now();
  const paymentId = text(event.paymentId, 240) || null;
  if (event.status === 'paid') {
    await db.prepare(`UPDATE fox3_orders SET status = 'paid', providerPaymentId = COALESCE(?, providerPaymentId), paidAt = COALESCE(paidAt, ?), updatedAt = ?
      WHERE id = ? AND status NOT IN ('refunded','refund_pending')`).bind(paymentId, now, now, order.id).run();
    const fresh = await loadOrder(db, String(order.id));
    if (fresh?.status === 'paid' && !order.paidAt) await notifyPaid(db, fresh, sendMail, defaultEmail);
  } else if (event.status === 'failed') {
    if (order.status === 'refund_pending') {
      await db.prepare(`UPDATE fox3_orders SET status = 'paid', updatedAt = ? WHERE id = ? AND status = 'refund_pending'`).bind(now, order.id).run();
      await addNotification(db, 'user', String(order.userId), 'refund_failed', '退款未完成', `订单 ${order.id} 的退款未能完成，请联系站长处理。`, String(order.id), `refund-failed:${order.id}`);
    } else {
      await db.prepare(`UPDATE fox3_orders SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'pending'`).bind(now, order.id).run();
    }
  } else if (event.status === 'cancelled') {
    await db.prepare(`UPDATE fox3_orders SET status = 'cancelled', updatedAt = ? WHERE id = ? AND status = 'pending'`).bind(now, order.id).run();
  } else if (event.status === 'refund_pending') {
    await db.prepare(`UPDATE fox3_orders SET status = 'refund_pending', updatedAt = ? WHERE id = ? AND status IN ('paid','shipped','refund_pending')`).bind(now, order.id).run();
  } else if (event.status === 'refunded') {
    await db.prepare(`UPDATE fox3_orders SET status = 'refunded', providerPaymentId = COALESCE(?, providerPaymentId), refundedAt = COALESCE(refundedAt, ?), updatedAt = ? WHERE id = ? AND status IN ('paid','shipped','refund_pending','refunded')`).bind(paymentId, now, now, order.id).run();
    await addNotification(db, 'user', String(order.userId), 'refund_succeeded', '退款已完成', `订单 ${order.id} 的退款已由支付平台确认。`, String(order.id), `refund-done:${order.id}`);
  }
  return new Response('OK', { status: 200 });
}

export async function handleCommerceRequest(
  request: Request,
  path: string,
  env: any,
  headers: Headers,
  auth: CommerceAuth,
): Promise<Response | null> {
  const matchOrder = path.match(/^\/orders\/([^/]+)(?:\/(cancel|capture|pay|verify|ship|refund|restore|delete-permanent))?$/);
  const isCommercePath = path === '/orders' || path === '/orders/trash' || Boolean(matchOrder) || path.startsWith('/chat/') || path.startsWith('/notifications') || path === '/legal-pages' || path === '/payment-settings' || path === '/payment-config-status' || path.startsWith('/payments/webhook/');
  if (!isCommercePath) return null;
  if (!env.DB) return json({ success: false, error: '此功能需要已绑定且迁移成功的 Cloudflare D1（DB）数据库' }, 503, headers);
  try {
    await ensureCommerceTables(env.DB);

    const webhook = path.match(/^\/payments\/webhook\/(alipay|wechat|stripe|paypal)$/);
    if (webhook && request.method === 'POST') {
      const provider = webhook[1];
      const rawBody = await request.text();
      if (rawBody.length > 1_000_000) return new Response('Webhook too large', { status: 413 });
      let event: any;
      try { event = await verifyPaymentWebhook(provider as PaymentProvider, request, rawBody, env); }
      catch (error: any) {
        console.warn(`[Payment] ${provider} webhook signature/verification rejected: ${String(error?.message || error).slice(0, 160)}`);
        return new Response('Invalid payment webhook', { status: 401 });
      }
      if (event.status === 'ignored') return provider === 'wechat'
        ? json({ code: 'SUCCESS', message: '成功' }, 200, headers)
        : new Response(provider === 'alipay' ? 'success' : 'OK', { status: 200 });
      const response = await applyWebhook(env.DB, provider, event, auth.sendMail, auth.defaultAdminEmail || '');
      if (response.ok && provider === 'wechat') return json({ code: 'SUCCESS', message: '成功' }, 200, headers);
      if (response.ok && provider === 'alipay') return new Response('success', { status: 200 });
      return response;
    }

    if (path === '/legal-pages' && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT pageKey, content, updatedAt FROM fox3_legal_pages').all();
      const pages: Record<string, string> = { ...LEGAL_DEFAULTS };
      const updatedAt: Record<string, number> = {};
      for (const row of result?.results || []) if ((PAGE_KEYS as readonly string[]).includes(String(row.pageKey))) {
        pages[String(row.pageKey)] = String(row.content || ''); updatedAt[String(row.pageKey)] = Number(row.updatedAt || 0);
      }
      return json({ success: true, pages, updatedAt }, 200, headers);
    }

    const isAdmin = await auth.isAdmin(request);
    const user = isAdmin ? null : await auth.getUser(request);
    const actorId = isAdmin ? 'admin' : user?.id || '';
    if (!actorId) return json({ success: false, error: '请先登录有效账户后使用订单、客服和消息功能' }, 401, headers);

    if (path === '/orders/trash' && request.method === 'DELETE') {
      const body = await request.json() as any;
      const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 200))] : [];
      if (!ids.length || ids.length > 100 || ids.length !== body.ids.length) return json({ success: false, error: '请提供1至100个有效且不重复的订单编号' }, 400, headers);
      const placeholders = ids.map(() => '?').join(',');
      const statement = isAdmin
        ? env.DB.prepare(`DELETE FROM fox3_orders WHERE deletedAt IS NOT NULL AND id IN (${placeholders})`).bind(...ids)
        : env.DB.prepare(`DELETE FROM fox3_orders WHERE deletedAt IS NOT NULL AND userId = ? AND id IN (${placeholders})`).bind(actorId, ...ids);
      const result = await statement.run();
      return json({ success: true, deletedCount: Number(result?.meta?.changes || 0) }, 200, headers);
    }
    if (path === '/orders' && request.method === 'GET') {
      const result = isAdmin
        ? await env.DB.prepare('SELECT * FROM fox3_orders WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 500').all()
        : await env.DB.prepare('SELECT * FROM fox3_orders WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 100').bind(actorId).all();
      return json({ success: true, orders: (result?.results || []).map((row: any) => rowToOrder(row, isAdmin)) }, 200, headers);
    }

    if (path === '/orders/trash' && request.method === 'GET') {
      const result = isAdmin
        ? await env.DB.prepare('SELECT * FROM fox3_orders WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC LIMIT 500').all()
        : await env.DB.prepare('SELECT * FROM fox3_orders WHERE userId = ? AND deletedAt IS NOT NULL ORDER BY deletedAt DESC LIMIT 100').bind(actorId).all();
      return json({ success: true, orders: (result?.results || []).map((row: any) => rowToOrder(row, isAdmin)) }, 200, headers);
    }

    if (path === '/orders' && request.method === 'POST') {
      if (isAdmin || !user) return json({ success: false, error: '订单必须由已注册的普通用户账户创建' }, 403, headers);
      const body = await request.json() as any;
      const productId = text(body?.productId, 200);
      const quantity = Number(body?.quantity);
      const provider = text(body?.paymentProvider, 16).toLowerCase();
      const customerName = text(body?.customerName, 160);
      const customerPhone = text(body?.customerPhone, 60);
      const customerEmail = text(body?.customerEmail, 254);
      const shippingAddress = text(body?.shippingAddress, 1000);
      const couponCode = text(body?.couponCode, 50).toUpperCase();
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !['alipay','wechat','stripe','paypal'].includes(provider)) {
        return json({ success: false, error: '商品、数量或支付渠道无效' }, 400, headers);
      }
      if (!customerName || !customerPhone || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(customerEmail) || !shippingAddress) {
        return json({ success: false, error: '请填写有效的姓名、联系电话、邮箱和收货地址' }, 400, headers);
      }
      const published = await env.DB.prepare('SELECT value FROM fox3_site_content WHERE id = ?').bind('published').first();
      if (!published?.value) return json({ success: false, error: '商品目录尚未发布到站点数据库' }, 503, headers);
      let products: any[] = [];
      try { products = JSON.parse(String(published.value))?.products || []; } catch {}
      const product = products.find((item: any) => item?.id === productId);
      if (!product || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return json({ success: false, error: '商品不存在或价格无效，请刷新页面' }, 404, headers);
      const stock = Number(product.stock || 50);
      if (quantity > stock) return json({ success: false, error: `库存不足，目前可购买 ${stock} 件` }, 409, headers);
      const priceCents = Math.round(Number(product.price) * 100);
      const discountRate = couponCode === 'FOX3' ? 0.15 : 0;
      const amountMinor = Math.round(priceCents * quantity * (1 - discountRate));
      if (amountMinor < 1 || amountMinor > 2_000_000_000) return json({ success: false, error: '订单金额超出安全范围' }, 400, headers);
      const id = `F3${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`.slice(0, 32);
      const now = Date.now();
      const discountMinor = priceCents * quantity - amountMinor;
      await env.DB.prepare(`INSERT INTO fox3_orders
        (id,userId,username,productId,productName,quantity,unitAmountMinor,amountMinor,currency,paymentProvider,status,customerName,customerPhone,customerEmail,shippingAddress,couponCode,discountMinor,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,? ,?,'pending',?,?,?,?,?,?,?,?)`)
        .bind(id, user.id, user.username, productId, text(product.name, 250), quantity, priceCents, amountMinor, 'CNY', provider,
          customerName, customerPhone, customerEmail.toLowerCase(), shippingAddress, discountRate ? couponCode : '', discountMinor, now, now).run();
      await notifyOrderCreated(env.DB, await loadOrder(env.DB, id), auth.sendMail, auth.defaultAdminEmail || '');
      const draft = { id, amountMinor, currency: 'CNY', productName: text(product.name, 250), quantity };
      try {
        const payment = await createPayment(provider as PaymentProvider, draft, env, new URL(request.url).origin);
        const finalAmountMinor = payment.chargedAmountMinor ?? amountMinor;
        const finalCurrency = payment.chargedCurrency ?? 'CNY';
        await env.DB.prepare('UPDATE fox3_orders SET amountMinor = ?, currency = ?, providerOrderId = ?, paymentUrl = ?, updatedAt = ? WHERE id = ?')
          .bind(finalAmountMinor, finalCurrency, payment.providerOrderId || null, payment.redirectUrl || null, Date.now(), id).run();
        const saved = await loadOrder(env.DB, id);
        return json({ success: true, order: rowToOrder(saved), payment, paymentError: payment.warning || undefined }, 201, headers);
      } catch (error: any) {
        await env.DB.prepare(`UPDATE fox3_orders SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'pending'`).bind(Date.now(), id).run();
        console.warn(`[Payment] ${provider} create payment failed for order ${id}: ${String(error?.message || error).slice(0, 180)}`);
        const saved = await loadOrder(env.DB, id);
        const body = `订单状态：未支付（支付初始化失败）\n订单号：${id}\n用户：${saved.username}\n商品：${saved.productName}\n数量：${saved.quantity}\n金额：${(Number(saved.amountMinor) / 100).toFixed(2)} ${saved.currency}\n订单已保存在回收站外的订单列表，可稍后处理。`;
        await addNotification(env.DB, 'admin', '', 'order_payment_failed', '订单未支付（支付初始化失败）', body, id, `payment-start-failed:${id}`);
        const prefs = await env.DB.prepare('SELECT adminEmail FROM fox3_payment_preferences WHERE id = ?').bind('default').first();
        const recipient = text(prefs?.adminEmail, 254) || text(auth.defaultAdminEmail, 254);
        if (recipient) try { await auth.sendMail(recipient, `订单未支付（支付初始化失败）：${id}`, body, `<div style="white-space:pre-wrap">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`); } catch {}
        return json({ success: true, order: rowToOrder(saved), payment: null, paymentError: String(error?.publicMessage || error?.message || '支付服务当前不可用；订单已保存为未支付').slice(0, 300) }, 201, headers);
      }
    }

    if (matchOrder) {
      const [, orderId, action] = matchOrder;
      const row = await loadOrder(env.DB, decodeURIComponent(orderId));
      if (!row) return json({ success: false, error: '订单不存在' }, 404, headers);
      if (!isAdmin && row.userId !== actorId) return json({ success: false, error: '无权访问此订单' }, 403, headers);
      if (action === 'delete-permanent' && request.method === 'DELETE') {
        if (row.deletedAt == null) return json({ success: false, error: '只能彻底删除回收站中的订单' }, 409, headers);
        const result = isAdmin
          ? await env.DB.prepare('DELETE FROM fox3_orders WHERE id = ? AND deletedAt IS NOT NULL').bind(row.id).run()
          : await env.DB.prepare('DELETE FROM fox3_orders WHERE id = ? AND userId = ? AND deletedAt IS NOT NULL').bind(row.id, actorId).run();
        return json({ success: true, deleted: Number(result?.meta?.changes || 0) > 0 }, 200, headers);
      }
      if (action === 'restore' && request.method === 'POST') {
        await env.DB.prepare('UPDATE fox3_orders SET deletedAt = NULL, updatedAt = ? WHERE id = ?').bind(Date.now(), row.id).run();
        return json({ success: true, order: rowToOrder(await loadOrder(env.DB, row.id), isAdmin) }, 200, headers);
      }
      if (!action && request.method === 'DELETE') {
        const now = Date.now();
        await env.DB.prepare('UPDATE fox3_orders SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL').bind(now, now, row.id).run();
        return json({ success: true, message: '订单已移入回收站' }, 200, headers);
      }
      if (!action && request.method === 'GET') {
        let currentRow = row;
        if (currentRow.status === 'pending' && currentRow.providerOrderId) {
          try {
            const check = await queryPaymentStatus(
              String(currentRow.paymentProvider) as PaymentProvider,
              {
                id: String(currentRow.id),
                amountMinor: Number(currentRow.amountMinor),
                currency: String(currentRow.currency),
                productName: String(currentRow.productName),
                quantity: Number(currentRow.quantity),
                providerOrderId: currentRow.providerOrderId ? String(currentRow.providerOrderId) : undefined,
              },
              env,
            );
            if (
              check.status === 'paid' &&
              (check.amountMinor == null || Number(check.amountMinor) === Number(currentRow.amountMinor)) &&
              (!check.currency || String(check.currency).toUpperCase() === String(currentRow.currency).toUpperCase())
            ) {
              const eventInsert = await env.DB.prepare('INSERT OR IGNORE INTO fox3_payment_events (eventId, provider, orderId, receivedAt) VALUES (?, ?, ?, ?)')
                .bind(`${currentRow.paymentProvider}:query:${check.paymentId || currentRow.id}`, String(currentRow.paymentProvider), String(currentRow.id), Date.now()).run();
              const now = Date.now();
              await env.DB.prepare(`UPDATE fox3_orders SET status = 'paid', providerPaymentId = COALESCE(?, providerPaymentId), paidAt = COALESCE(paidAt, ?), updatedAt = ? WHERE id = ? AND status IN ('pending','failed')`)
                .bind(check.paymentId || null, now, now, currentRow.id).run();
              currentRow = await loadOrder(env.DB, row.id);
              if (Number(eventInsert?.meta?.changes || 0) > 0 && currentRow?.status === 'paid') {
                await notifyPaid(env.DB, currentRow, auth.sendMail, auth.defaultAdminEmail || '');
              }
            } else if (check.status === 'cancelled') {
              await env.DB.prepare(`UPDATE fox3_orders SET status = 'cancelled', updatedAt = ? WHERE id = ? AND status = 'pending'`)
                .bind(Date.now(), currentRow.id).run();
              currentRow = await loadOrder(env.DB, row.id);
            }
          } catch {
            // Keep persisted status when gateway status query is temporarily unreachable
          }
        }
        return json({ success: true, order: rowToOrder(currentRow, isAdmin) }, 200, headers);
      }
      if (action === 'verify' && request.method === 'POST') {
        if (row.status === 'paid' || row.status === 'shipped') {
          return json({ success: true, verified: true, order: rowToOrder(row, isAdmin) }, 200, headers);
        }
        try {
          const check = await queryPaymentStatus(
            String(row.paymentProvider) as PaymentProvider,
            {
              id: String(row.id),
              amountMinor: Number(row.amountMinor),
              currency: String(row.currency),
              productName: String(row.productName),
              quantity: Number(row.quantity),
              providerOrderId: row.providerOrderId ? String(row.providerOrderId) : undefined,
            },
            env,
          );
          if (check.status === 'paid') {
            if (
              (check.amountMinor != null && Number(check.amountMinor) !== Number(row.amountMinor)) ||
              (check.currency && String(check.currency).toUpperCase() !== String(row.currency).toUpperCase())
            ) {
              return json({ success: false, error: '支付平台返回金额或币种与订单不符，已拒绝自动确认' }, 409, headers);
            }
            const eventInsert = await env.DB.prepare('INSERT OR IGNORE INTO fox3_payment_events (eventId, provider, orderId, receivedAt) VALUES (?, ?, ?, ?)')
              .bind(`${row.paymentProvider}:verify:${check.paymentId || row.id}`, String(row.paymentProvider), String(row.id), Date.now()).run();
            const now = Date.now();
            await env.DB.prepare(`UPDATE fox3_orders SET status = 'paid', providerPaymentId = COALESCE(?, providerPaymentId), paidAt = COALESCE(paidAt, ?), updatedAt = ? WHERE id = ? AND status IN ('pending','failed')`)
              .bind(check.paymentId || null, now, now, row.id).run();
            const fresh = await loadOrder(env.DB, row.id);
            if (Number(eventInsert?.meta?.changes || 0) > 0 && fresh?.status === 'paid') {
              await notifyPaid(env.DB, fresh, auth.sendMail, auth.defaultAdminEmail || '');
            }
            return json({ success: true, verified: true, order: rowToOrder(fresh, isAdmin), message: '支付状态已向网关核验成功！' }, 200, headers);
          }
          if (check.status === 'cancelled') {
            await env.DB.prepare(`UPDATE fox3_orders SET status = 'cancelled', updatedAt = ? WHERE id = ? AND status = 'pending'`).bind(Date.now(), row.id).run();
          } else if (check.status === 'failed') {
            await env.DB.prepare(`UPDATE fox3_orders SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'pending'`).bind(Date.now(), row.id).run();
          }
          return json({ success: true, verified: false, providerStatus: check.status, order: rowToOrder(await loadOrder(env.DB, row.id), isAdmin), message: '支付平台暂未确认到账，请在完成付款后再次点击核验。' }, 200, headers);
        } catch (error: any) {
          return json({ success: false, error: String(error?.message || '向支付平台核验订单状态失败').slice(0, 240) }, 502, headers);
        }
      }
      if (action === 'pay' && request.method === 'POST') {
        if (isAdmin || row.userId !== actorId || !['pending', 'failed'].includes(String(row.status))) {
          return json({ success: false, error: '仅本人待支付或支付初始化失败的订单可重新发起支付' }, 409, headers);
        }
        try {
          const payment = await createPayment(
            String(row.paymentProvider) as PaymentProvider,
            {
              id: String(row.id),
              amountMinor: Number(row.amountMinor),
              currency: String(row.currency),
              productName: String(row.productName),
              quantity: Number(row.quantity),
            },
            env,
            new URL(request.url).origin,
          );
          const finalAmountMinor = payment.chargedAmountMinor ?? Number(row.amountMinor);
          const finalCurrency = payment.chargedCurrency ?? String(row.currency);
          await env.DB.prepare(`UPDATE fox3_orders SET status = 'pending', amountMinor = ?, currency = ?, providerOrderId = ?, paymentUrl = ?, updatedAt = ? WHERE id = ?`)
            .bind(finalAmountMinor, finalCurrency, payment.providerOrderId || null, payment.redirectUrl || null, Date.now(), row.id).run();
          return json({ success: true, order: rowToOrder(await loadOrder(env.DB, row.id)), payment, paymentError: payment.warning || undefined }, 200, headers);
        } catch (error: any) {
          return json({ success: false, error: String(error?.message || '重新发起支付失败').slice(0, 260) }, 502, headers);
        }
      }
      if (action === 'cancel' && request.method === 'POST') {
        if (isAdmin || !['pending', 'failed'].includes(String(row.status))) return json({ success: false, error: '仅订单本人可取消尚未支付的订单' }, 409, headers);
        await env.DB.prepare(`UPDATE fox3_orders SET status = 'cancelled', updatedAt = ? WHERE id = ? AND userId = ? AND status IN ('pending','failed')`).bind(Date.now(), row.id, actorId).run();
        return json({ success: true, order: rowToOrder(await loadOrder(env.DB, row.id)) }, 200, headers);
      }
      if (action === 'capture' && request.method === 'POST') {
        // Server-side PayPal capture; only mark paid after PayPal confirms COMPLETED with matching amount and currency.
        if (isAdmin || row.userId !== actorId || row.paymentProvider !== 'paypal' || !['pending', 'failed'].includes(String(row.status))) return json({ success: false, error: '当前订单不可执行 PayPal 捕获' }, 409, headers);
        if (!row.providerOrderId) return json({ success: false, error: 'PayPal 支付订单标识缺失' }, 409, headers);
        try {
          const capture = await capturePayPalOrder(String(row.providerOrderId), env);
          if (capture.status === 'COMPLETED' && capture.paymentId) {
            if (Number(capture.amountMinor) !== Number(row.amountMinor) || String(capture.currency || '').toUpperCase() !== String(row.currency).toUpperCase()) {
              return json({ success: false, error: 'PayPal 捕获金额/币种与订单不符，已阻止订单确认' }, 409, headers);
            }
            const eventInsert = await env.DB.prepare('INSERT OR IGNORE INTO fox3_payment_events (eventId, provider, orderId, receivedAt) VALUES (?, ?, ?, ?)')
              .bind(`paypal:capture:${capture.paymentId}`, 'paypal', String(row.id), Date.now()).run();
            const now = Date.now();
            await env.DB.prepare(`UPDATE fox3_orders SET status = 'paid', providerPaymentId = ?, paidAt = COALESCE(paidAt, ?), updatedAt = ? WHERE id = ? AND userId = ? AND status IN ('pending','failed')`)
              .bind(capture.paymentId, now, now, row.id, actorId).run();
            const fresh = await loadOrder(env.DB, row.id);
            if (Number(eventInsert?.meta?.changes || 0) > 0 && fresh?.status === 'paid') {
              await notifyPaid(env.DB, fresh, auth.sendMail, auth.defaultAdminEmail || '');
            }
          } else if (capture.status === 'DECLINED') {
            await env.DB.prepare(`UPDATE fox3_orders SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'pending'`).bind(Date.now(), row.id).run();
          }
          return json({ success: true, captureStatus: capture.status, order: rowToOrder(await loadOrder(env.DB, row.id)), message: capture.status === 'COMPLETED' ? 'PayPal 扣款已确认，订单已标记为已支付！' : '支付平台尚未确认完成，请稍后刷新订单。' }, 200, headers);
        } catch (err: any) {
          return json({ success: false, error: String(err?.message || 'PayPal 服务端捕获失败；请重试或检查 PayPal 控制台').slice(0, 240) }, 502, headers);
        }
      }
      if (action === 'ship' && request.method === 'POST') {
        if (!isAdmin || row.status !== 'paid') return json({ success: false, error: '只有管理员可为已支付订单确认发货' }, 403, headers);
        const body = await request.json() as any;
        const trackingNumber = text(body?.trackingNumber, 160);
        const carrier = text(body?.carrier, 100);
        const now = Date.now();
        await env.DB.prepare(`UPDATE fox3_orders SET status = 'shipped', trackingNumber = ?, carrier = ?, shippedAt = ?, updatedAt = ? WHERE id = ? AND status = 'paid'`)
          .bind(trackingNumber || null, carrier || null, now, now, row.id).run();
        await addNotification(env.DB, 'user', String(row.userId), 'order_shipped', '订单已确认发货', `订单 ${row.id} 已确认发货。${carrier ? `承运方：${carrier}。` : ''}${trackingNumber ? `运单号：${trackingNumber}` : ''}`, String(row.id), `shipped:${row.id}`);
        return json({ success: true, order: rowToOrder(await loadOrder(env.DB, row.id), true) }, 200, headers);
      }
      if (action === 'refund' && request.method === 'POST') {
        if (!isAdmin || !['paid','shipped','refund_pending'].includes(String(row.status))) return json({ success: false, error: '仅管理员可为已支付且未退款的订单申请原路退款' }, 403, headers);
        if (!row.providerPaymentId && !row.providerOrderId) return json({ success: false, error: '支付平台尚未返回可用于退款的交易标识' }, 409, headers);
        const body = await request.json() as any;
        const reason = text(body?.reason, 500);
        try {
          const result = await refundPayment(String(row.paymentProvider) as PaymentProvider, { ...row, id: String(row.id), amountMinor: Number(row.amountMinor), currency: String(row.currency) }, reason, env);
          const status = result.status === 'refunded' ? 'refunded' : 'refund_pending';
          const now = Date.now();
          await env.DB.prepare(`UPDATE fox3_orders SET status = ?, refundId = ?, refundReason = ?, refundedAt = CASE WHEN ? = 'refunded' THEN ? ELSE refundedAt END, updatedAt = ? WHERE id = ? AND status IN ('paid','shipped','refund_pending')`)
            .bind(status, result.refundId || null, reason, status, now, now, row.id).run();
          await addNotification(env.DB, 'user', String(row.userId), status === 'refunded' ? 'refund_succeeded' : 'refund_pending', status === 'refunded' ? '退款已完成' : '退款处理中', `订单 ${row.id}：${status === 'refunded' ? '退款已由支付平台确认' : '退款请求已提交，最终状态以支付平台确认通知为准'}`, String(row.id), `${status}:${row.id}`);
          return json({ success: true, order: rowToOrder(await loadOrder(env.DB, row.id), true) }, 200, headers);
        } catch (error: any) {
          console.warn(`[Payment] refund call failed for order ${row.id}: ${String(error?.message || error).slice(0, 180)}`);
          return json({ success: false, error: String(error?.publicMessage || error?.message || '支付平台拒绝退款请求；订单状态未被标记为退款成功').slice(0, 300) }, 502, headers);
        }
      }
      return json({ success: false, error: 'Method not allowed' }, 405, headers);
    }

    if (path === '/payment-config-status' && request.method === 'GET') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可查看支付配置状态' }, 403, headers);
      const groups: Record<string, string[]> = {
        alipay: ['ALIPAY_APP_ID','ALIPAY_PRIVATE_KEY','ALIPAY_PUBLIC_KEY'],
        wechat: ['WECHAT_MCHID','WECHAT_APPID','WECHAT_SERIAL_NO','WECHAT_PRIVATE_KEY','WECHAT_API_V3_KEY','WECHAT_PLATFORM_CERT','WECHAT_NOTIFY_URL'],
        stripe: ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'],
        paypal: ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID'],
      };
      const providers = Object.fromEntries(Object.entries(groups).map(([provider, names]) => [provider, Object.fromEntries(names.map(name => [name, Boolean(String(env[name] || '').trim())]))]));
      return json({ success: true, providers, note: '仅返回变量是否已配置，不返回密钥值；此状态不验证商户账号、权限或收款可用性。万里汇当前尚未接入支付适配器。' }, 200, headers);
    }
    if (path === '/payment-settings') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可查看和修改支付通知设置' }, 403, headers);
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT adminEmail, notifyEmail, updatedAt FROM fox3_payment_preferences WHERE id = ?').bind('default').first();
        return json({ success: true, settings: { adminEmail: String(row?.adminEmail || ''), notifyEmail: Number(row?.notifyEmail) === 1, updatedAt: Number(row?.updatedAt || 0) } }, 200, headers);
      }
      if (request.method === 'POST') {
        const body = await request.json() as any;
        const email = text(body?.adminEmail, 254).toLowerCase();
        const enabled = body?.notifyEmail === true;
        if (enabled && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) return json({ success: false, error: '启用支付邮件通知前，请填写有效的接收邮箱' }, 400, headers);
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO fox3_payment_preferences (id, adminEmail, notifyEmail, updatedAt) VALUES ('default', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET adminEmail = excluded.adminEmail, notifyEmail = excluded.notifyEmail, updatedAt = excluded.updatedAt`)
          .bind(email, enabled ? 1 : 0, now).run();
        return json({ success: true, settings: { adminEmail: email, notifyEmail: enabled, updatedAt: now } }, 200, headers);
      }
      return json({ success: false, error: 'Method not allowed' }, 405, headers);
    }

    if (path === '/legal-pages') {
      if (request.method === 'GET') {
        const result = await env.DB.prepare('SELECT pageKey, content, updatedAt FROM fox3_legal_pages').all();
        const pages: Record<string, string> = { ...LEGAL_DEFAULTS };
        const updatedAt: Record<string, number> = {};
        for (const row of result?.results || []) if ((PAGE_KEYS as readonly string[]).includes(String(row.pageKey))) {
          pages[String(row.pageKey)] = String(row.content || ''); updatedAt[String(row.pageKey)] = Number(row.updatedAt || 0);
        }
        return json({ success: true, pages, updatedAt }, 200, headers);
      }
      if (request.method === 'PUT') {
        if (!isAdmin) return json({ success: false, error: '仅管理员可编辑法律与联系方式页面' }, 403, headers);
        const body = await request.json() as any;
        if (!body?.pages || typeof body.pages !== 'object' || Array.isArray(body.pages)) return json({ success: false, error: '页面内容格式无效' }, 400, headers);
        const now = Date.now();
        const statements = PAGE_KEYS.map(key => env.DB.prepare(`INSERT INTO fox3_legal_pages (pageKey, content, updatedAt) VALUES (?, ?, ?)
          ON CONFLICT(pageKey) DO UPDATE SET content = excluded.content, updatedAt = excluded.updatedAt`)
          .bind(key, text(body.pages[key], 50000), now));
        await env.DB.batch(statements);
        return json({ success: true, updatedAt: now }, 200, headers);
      }
      return json({ success: false, error: 'Method not allowed' }, 405, headers);
    }

    if (path === '/notifications/unread' && request.method === 'GET') {
      const role = isAdmin ? 'admin' : 'user';
      const recipient = isAdmin ? '' : actorId;
      const unread = await env.DB.prepare(`SELECT COUNT(*) AS count FROM fox3_notifications WHERE recipientRole = ? AND recipientId = ? AND readAt IS NULL`)
        .bind(role, recipient).first();
      const messages = await env.DB.prepare(`SELECT COUNT(*) AS count FROM fox3_chat_messages m JOIN fox3_conversations c ON c.id = m.conversationId
        WHERE c.deletedAt IS NULL AND m.readAt IS NULL AND m.senderRole <> ? AND (? = 1 OR c.userId = ?)`)
        .bind(isAdmin ? 'admin' : 'user', isAdmin ? 1 : 0, actorId).first();
      const latest = await env.DB.prepare(`SELECT kind, refId, title FROM fox3_notifications
        WHERE recipientRole = ? AND recipientId = ? AND readAt IS NULL ORDER BY createdAt DESC LIMIT 1`).bind(role, recipient).first();
      const latestMessage = await env.DB.prepare(`SELECT c.id AS conversationId FROM fox3_chat_messages m JOIN fox3_conversations c ON c.id = m.conversationId
        WHERE c.deletedAt IS NULL AND m.readAt IS NULL AND m.senderRole <> ? AND (? = 1 OR c.userId = ?) ORDER BY m.createdAt DESC LIMIT 1`)
        .bind(isAdmin ? 'admin' : 'user', isAdmin ? 1 : 0, actorId).first();
      const latestIsOrder = String(latest?.kind || '').startsWith('order_') || String(latest?.kind || '').startsWith('payment_');
      const latestKind = latestIsOrder ? 'orders' : latest ? 'chat' : latestMessage ? 'chat' : 'orders';
      return json({ success: true, count: Number(unread?.count || 0) + Number(messages?.count || 0), target: latestKind,
        refId: latestKind === 'chat' ? String(latest?.refId || latestMessage?.conversationId || '') : String(latest?.refId || ''),
        title: String(latest?.title || '') }, 200, headers);
    }
    if (path === '/notifications/read' && request.method === 'POST') {
      const role = isAdmin ? 'admin' : 'user';
      await env.DB.prepare('UPDATE fox3_notifications SET readAt = ? WHERE recipientRole = ? AND recipientId = ? AND readAt IS NULL')
        .bind(Date.now(), role, isAdmin ? '' : actorId).run();
      return json({ success: true }, 200, headers);
    }

    if (path === '/chat/conversations/trash' && request.method === 'GET') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可查看站内客服对话回收站' }, 403, headers);
      const result = await env.DB.prepare(`SELECT c.id,c.userId,c.username,c.createdAt,c.updatedAt,c.deletedAt,
        (SELECT message FROM fox3_chat_messages m WHERE m.conversationId=c.id ORDER BY m.createdAt DESC LIMIT 1) AS lastMessage,
        (SELECT COUNT(*) FROM fox3_chat_messages m WHERE m.conversationId=c.id) AS messageCount
        FROM fox3_conversations c WHERE c.deletedAt IS NOT NULL ORDER BY c.deletedAt DESC LIMIT 200`).all();
      return json({ success: true, conversations: result?.results || [] }, 200, headers);
    }
    if (path === '/chat/conversations/trash' && request.method === 'DELETE') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可清空客服对话回收站' }, 403, headers);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM fox3_chat_messages WHERE conversationId IN (SELECT id FROM fox3_conversations WHERE deletedAt IS NOT NULL)'),
        env.DB.prepare("DELETE FROM fox3_notifications WHERE kind = 'chat_message' AND refId IN (SELECT id FROM fox3_conversations WHERE deletedAt IS NOT NULL)"),
        env.DB.prepare('DELETE FROM fox3_conversations WHERE deletedAt IS NOT NULL'),
      ]);
      return json({ success: true, message: '客服对话回收站已清空' }, 200, headers);
    }
    const restoreConversationMatch = path.match(/^\/chat\/conversations\/([^/]+)\/restore$/);
    if (restoreConversationMatch && request.method === 'POST') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可恢复客服对话' }, 403, headers);
      const conversationId = decodeURIComponent(restoreConversationMatch[1]);
      const conversation = await env.DB.prepare('SELECT id FROM fox3_conversations WHERE id = ?').bind(conversationId).first();
      if (!conversation) return json({ success: false, error: '对话不存在或已被彻底删除' }, 404, headers);
      await env.DB.prepare('UPDATE fox3_conversations SET deletedAt = NULL, updatedAt = ? WHERE id = ?').bind(Date.now(), conversationId).run();
      return json({ success: true, message: '客服对话已恢复' }, 200, headers);
    }
    const deleteConversationMatch = path.match(/^\/chat\/conversations\/([^/]+)$/);
    if (deleteConversationMatch && request.method === 'DELETE') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可删除客服对话' }, 403, headers);
      const conversationId = decodeURIComponent(deleteConversationMatch[1]);
      const permanent = new URL(request.url).searchParams.get('permanent') === '1';
      const conversation = await env.DB.prepare('SELECT id, deletedAt FROM fox3_conversations WHERE id = ?').bind(conversationId).first();
      if (!conversation) return json({ success: false, error: '对话不存在或已被删除' }, 404, headers);
      if (permanent || conversation.deletedAt != null) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM fox3_chat_messages WHERE conversationId = ?').bind(conversationId),
          env.DB.prepare("DELETE FROM fox3_notifications WHERE kind = 'chat_message' AND refId = ?").bind(conversationId),
          env.DB.prepare('DELETE FROM fox3_conversations WHERE id = ?').bind(conversationId),
        ]);
        return json({ success: true, permanent: true, message: '客服对话及消息已彻底删除' }, 200, headers);
      }
      const now = Date.now();
      await env.DB.prepare('UPDATE fox3_conversations SET deletedAt = ?, updatedAt = ? WHERE id = ?').bind(now, now, conversationId).run();
      return json({ success: true, permanent: false, message: '客服对话已移入回收站' }, 200, headers);
    }
    if (path === '/chat/conversations/ensure' && request.method === 'POST') {
      if (!isAdmin) return json({ success: false, error: '仅管理员可从订单发起对话' }, 403, headers);
      const body = await request.json() as any;
      const userId = text(body?.userId, 200);
      const username = text(body?.username, 120) || '用户';
      if (!userId) return json({ success: false, error: '订单缺少用户标识，无法打开客服对话' }, 400, headers);
      let conversation = await env.DB.prepare('SELECT id, deletedAt FROM fox3_conversations WHERE userId = ?').bind(userId).first();
      const now = Date.now();
      if (conversation && conversation.deletedAt != null) {
        await env.DB.prepare('UPDATE fox3_conversations SET deletedAt = NULL, updatedAt = ? WHERE id = ?').bind(now, conversation.id).run();
      } else if (!conversation) {
        const id = uuid('chat');
        await env.DB.prepare('INSERT OR IGNORE INTO fox3_conversations (id,userId,username,createdAt,updatedAt,deletedAt) VALUES (?,?,?,?,?,NULL)').bind(id, userId, username, now, now).run();
        conversation = await env.DB.prepare('SELECT id FROM fox3_conversations WHERE userId = ?').bind(userId).first();
      }
      return json({ success: true, conversationId: String(conversation?.id || '') }, 200, headers);
    }
    if (path === '/chat/conversations' && request.method === 'GET') {
      if (isAdmin) {
        const result = await env.DB.prepare(`SELECT c.id,c.userId,c.username,c.createdAt,c.updatedAt,
          (SELECT message FROM fox3_chat_messages m WHERE m.conversationId=c.id ORDER BY m.createdAt DESC LIMIT 1) AS lastMessage,
          (SELECT COUNT(*) FROM fox3_chat_messages m WHERE m.conversationId=c.id AND m.readAt IS NULL AND m.senderRole <> 'admin') AS unread
          FROM fox3_conversations c WHERE c.deletedAt IS NULL ORDER BY c.updatedAt DESC LIMIT 200`).all();
        return json({ success: true, conversations: result?.results || [] }, 200, headers);
      }
      const result = await env.DB.prepare('SELECT id,userId,username,createdAt,updatedAt FROM fox3_conversations WHERE userId = ? AND deletedAt IS NULL LIMIT 1').bind(actorId).first();
      return json({ success: true, conversations: result ? [result] : [] }, 200, headers);
    }
    if (path === '/chat/messages' && request.method === 'GET') {
      const conversationId = text(new URL(request.url).searchParams.get('conversationId'), 200);
      if (!conversationId) return json({ success: false, error: '缺少对话编号' }, 400, headers);
      const conversation = await env.DB.prepare('SELECT id,userId FROM fox3_conversations WHERE id = ?').bind(conversationId).first();
      if (!conversation || (!isAdmin && conversation.userId !== actorId)) return json({ success: false, error: '无权读取此对话' }, 403, headers);
      const result = await env.DB.prepare('SELECT id,conversationId,senderId,senderRole,senderName,message,createdAt FROM fox3_chat_messages WHERE conversationId = ? ORDER BY createdAt ASC LIMIT 500').bind(conversationId).all();
      await env.DB.prepare('UPDATE fox3_chat_messages SET readAt = ? WHERE conversationId = ? AND senderRole <> ? AND readAt IS NULL')
        .bind(Date.now(), conversationId, isAdmin ? 'admin' : 'user').run();
      return json({ success: true, messages: result?.results || [] }, 200, headers);
    }
    if (path === '/chat/messages' && request.method === 'POST') {
      const body = await request.json() as any;
      const plainMessage = text(body?.message, 4000);
      const rawAttachments = body?.attachments;
      if (rawAttachments !== undefined && (!Array.isArray(rawAttachments) || rawAttachments.length > 5)) return json({ success: false, error: '附件最多5个' }, 400, headers);
      const attachments: Array<{ name: string; url: string; mime: string; size: number }> = [];
      let totalBytes = 0;
      for (const item of rawAttachments || []) {
        const name = typeof item?.name === 'string' ? item.name.trim() : '';
        const url = typeof item?.url === 'string' ? item.url.trim() : '';
        const mime = typeof item?.mime === 'string' ? item.mime.trim().toLowerCase() : '';
        const size = Number(item?.size);
        let parsedUrl: URL;
        try { parsedUrl = new URL(url, new URL(request.url).origin); } catch { return json({ success: false, error: '附件地址无效' }, 400, headers); }
        const origin = new URL(request.url).origin;
        const managedPath = parsedUrl.origin === origin && /^\/api\/files\/[A-Za-z0-9._%/-]+$/.test(parsedUrl.pathname) && !parsedUrl.pathname.split('/').some(part => part === '.' || part === '..') && !parsedUrl.search && !parsedUrl.hash;
        const trustedStorage = parsedUrl.protocol === 'https:' && /^(?:[a-z0-9-]+\.)?r2\.dev$/.test(parsedUrl.hostname) && /^\/[A-Za-z0-9._%/-]+$/.test(parsedUrl.pathname);
        const allowedMime = /^(image\/(?:png|jpeg|gif|webp|avif)|application\/(?:pdf|zip|json|msword|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/(?:plain|csv|markdown))$/.test(mime);
        if (!managedPath && !trustedStorage) return json({ success: false, error: '附件必须使用本站托管文件地址或可信云存储地址' }, 400, headers);
        if (!name || name.length > 180 || /[\u0000-\u001f\u007f]/.test(name) || !allowedMime || !Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) return json({ success: false, error: '附件名称、类型或大小无效' }, 400, headers);
        totalBytes += size;
        if (totalBytes > 25 * 1024 * 1024) return json({ success: false, error: '附件总大小不能超过25 MB' }, 400, headers);
        attachments.push({ name, url: managedPath ? `${parsedUrl.pathname}` : parsedUrl.toString(), mime, size });
      }
      if (!plainMessage && !attachments.length) return json({ success: false, error: '请输入消息或添加附件' }, 400, headers);
      const message = attachments.length ? JSON.stringify({ type: 'siteowner-chat-v1', text: plainMessage, attachments }) : plainMessage;
      if (message.length > 12000) return json({ success: false, error: '消息内容超出限制' }, 400, headers);
      let conversationId = text(body?.conversationId, 200);
      let conversation: any = conversationId ? await env.DB.prepare('SELECT id,userId,username,deletedAt FROM fox3_conversations WHERE id = ?').bind(conversationId).first() : null;
      if (isAdmin) {
        if (!conversation) return json({ success: false, error: '管理员回复必须选择现有用户对话' }, 400, headers);
      } else {
        if (conversation && conversation.userId !== actorId) return json({ success: false, error: '无权向其他账户对话' }, 403, headers);
        if (!conversation) {
          const existing = await env.DB.prepare('SELECT id,userId,username,deletedAt FROM fox3_conversations WHERE userId = ?').bind(actorId).first();
          if (existing) {
            conversation = existing;
            conversationId = String(existing.id);
          } else {
            conversationId = uuid('chat');
            const now = Date.now();
            await env.DB.prepare('INSERT INTO fox3_conversations (id,userId,username,createdAt,updatedAt,deletedAt) VALUES (?,?,?,?,?,NULL)').bind(conversationId, actorId, user!.username, now, now).run();
            conversation = { id: conversationId, userId: actorId, username: user!.username, deletedAt: null };
          }
        }
      }
      const now = Date.now();
      const senderRole = isAdmin ? 'admin' : 'user';
      const senderId = isAdmin ? 'admin' : actorId;
      const senderName = isAdmin ? '站长' : user!.username;
      const messageId = uuid('msg');
      await env.DB.batch([
        env.DB.prepare('INSERT INTO fox3_chat_messages (id,conversationId,senderId,senderRole,senderName,message,createdAt,readAt) VALUES (?,?,?,?,?,?,?,NULL)')
          .bind(messageId, conversationId, senderId, senderRole, senderName, message, now),
        env.DB.prepare('UPDATE fox3_conversations SET deletedAt = NULL, updatedAt = ? WHERE id = ?').bind(now, conversationId),
      ]);
      if (isAdmin) await addNotification(env.DB, 'user', String(conversation.userId), 'chat_message', '站长回复了你的消息', message.slice(0, 200), conversationId);
      else await addNotification(env.DB, 'admin', '', 'chat_message', '收到新的用户咨询', `${user!.username}：${message.slice(0, 180)}`, conversationId);
      return json({ success: true, conversationId, message: { id: messageId, conversationId, senderId, senderRole, senderName, message, createdAt: now } }, 201, headers);
    }
    if (path === '/chat/read' && request.method === 'POST') {
      const body = await request.json() as any;
      const conversationId = text(body?.conversationId, 200);
      if (conversationId) {
        const conversation = await env.DB.prepare('SELECT id,userId FROM fox3_conversations WHERE id = ?').bind(conversationId).first();
        if (!conversation || (!isAdmin && conversation.userId !== actorId)) return json({ success: false, error: '无权标记此对话' }, 403, headers);
        await env.DB.prepare('UPDATE fox3_chat_messages SET readAt = ? WHERE conversationId = ? AND senderRole <> ? AND readAt IS NULL').bind(Date.now(), conversationId, isAdmin ? 'admin' : 'user').run();
      }
      return json({ success: true }, 200, headers);
    }
    return json({ success: false, error: 'Method not allowed' }, 405, headers);
  } catch (error: any) {
    const detail = String(error?.message || error || 'unknown').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
    console.error('[Commerce] API failure:', String(error?.stack || detail).slice(0, 700));
    return json({ success: false, error: `D1 数据库操作失败：${detail}。请确认 Pages 已绑定 DB，按顺序应用 migrations/0002_commerce.sql、0003_order_trash.sql 与 0004_chat_trash.sql。` }, 503, headers);
  }
}
