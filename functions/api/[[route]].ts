import { createVerificationCode, dispatchEmail, escapeHtml, normalizeEmail, probeResendConnection, type MailProvider, type OutboundMailSettings } from '../mail';
import { fetchImapMessages, testImapConnection, type ImapSettings } from '../imap';
import { getExternalObjectStoreConfig, getExternalObject, putExternalObject, deleteExternalObject, probeExternalObjectStore } from '../object-storage';
import { handleWebDavAction } from '../webdav';
import { handleCommerceRequest } from '../commerce';

// Cloudflare Pages Functions API Handler
// Routes: /api/*

interface Env {
  DB?: any;        // Cloudflare D1 Database binding
  D1?: any;        // Alias for Cloudflare D1 Database binding
  DATABASE?: any;  // Alias for Cloudflare D1 Database binding
  R2_BUCKET?: any; // Cloudflare R2 Bucket binding
  R2?: any;        // Alias for Cloudflare R2 Bucket binding
  BUCKET?: any;    // Alias for Cloudflare R2 Bucket binding
  KV?: any;        // Cloudflare KV Namespace binding
  FOX3_KV?: any;   // Alias for KV Namespace binding
  MAIL_PROVIDER?: string;
  MAIL_SENDER?: string;
  MAIL_API_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  BREVO_API_KEY?: string;
  SENDGRID_API_KEY?: string;
  SENDCLOUD_API_USER?: string;
  SENDCLOUD_API_KEY?: string;
  OBJECT_STORAGE_PROVIDER?: string;
  COS_SECRET_ID?: string;
  COS_SECRET_KEY?: string;
  COS_REGION?: string;
  COS_BUCKET?: string;
  OSS_ACCESS_KEY_ID?: string;
  OSS_ACCESS_KEY_SECRET?: string;
  OSS_REGION?: string;
  OSS_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ENDPOINT?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURITY?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  IMAP_HOST?: string;
  IMAP_PORT?: string;
  IMAP_USER?: string;
  IMAP_PASS?: string;
  IMAP_TLS?: string;
  ADMIN_SESSION_SECRET?: string;
  VERIFY_CODE_LENGTH?: string;
  VERIFY_EMAIL_SUBJECT?: string;
  VERIFY_EMAIL_TEMPLATE?: string;
}

function getOutboundSettings(client: any, env: any): OutboundMailSettings {
  const smtpHost = (env.SMTP_HOST || client?.smtpHost || '').trim();
  const explicitProvider = String(env.MAIL_PROVIDER || client?.provider || '').trim().toLowerCase();
  const inferredProvider = (env.RESEND_API_KEY || env.MAIL_API_KEY || client?.apiKey)
    ? 'resend'
    : env.BREVO_API_KEY
      ? 'brevo'
      : env.SENDGRID_API_KEY
        ? 'sendgrid'
        : env.SENDCLOUD_API_KEY
          ? 'sendcloud'
          : smtpHost
            ? 'smtp'
            : 'resend';
  const providerValue = (explicitProvider || inferredProvider).toLowerCase();
  const supportedProviders: MailProvider[] = ['smtp', 'resend', 'brevo', 'sendgrid', 'sendcloud'];
  const provider = (supportedProviders.includes(providerValue as MailProvider) ? providerValue : 'smtp') as MailProvider;
  const smtpPort = Number(env.SMTP_PORT || client?.smtpPort || 465);
  const smtpSecurityValue = String(env.SMTP_SECURITY || client?.smtpSecurity || (smtpPort === 465 ? 'ssl' : 'starttls')).toLowerCase();
  const smtpSecurity = smtpSecurityValue === 'starttls' ? 'starttls' : 'ssl';
  const apiKey = provider === 'brevo'
    ? env.BREVO_API_KEY || client?.apiKey
    : provider === 'sendgrid'
      ? env.SENDGRID_API_KEY || client?.apiKey
      : provider === 'sendcloud'
        ? env.SENDCLOUD_API_KEY || client?.apiKey
      : env.RESEND_API_KEY || env.MAIL_API_KEY || client?.apiKey;
  const smtpPass = env.SMTP_PASS || client?.smtpPass || (smtpHost === 'smtp.resend.com' ? (env.RESEND_API_KEY || env.MAIL_API_KEY) : '');

  return {
    provider,
    apiKey: typeof apiKey === 'string' ? apiKey : '',
    apiUser: typeof (env.SENDCLOUD_API_USER || client?.apiUser) === 'string' ? (env.SENDCLOUD_API_USER || client?.apiUser).trim() : '',
    smtpHost,
    smtpPort,
    smtpSecurity,
    smtpUser: (env.SMTP_USER || client?.smtpUser || '').trim(),
    smtpPass: typeof smtpPass === 'string' ? smtpPass : '',
    senderEmail: (env.MAIL_SENDER || client?.senderEmail || '').trim(),
  };
}

function hasOutboundMailService(settings: OutboundMailSettings): boolean {
  if (!settings.senderEmail) return false;
  if (settings.provider === 'smtp') return Boolean(settings.smtpHost && settings.smtpPass);
  return Boolean(settings.apiKey);
}

function getImapSettings(clientImap: any, env: any): ImapSettings {
  const host = String(env.IMAP_HOST || clientImap?.host || '').trim();
  const port = Number(env.IMAP_PORT || clientImap?.port || 993);
  const tlsValue = env.IMAP_TLS !== undefined ? String(env.IMAP_TLS).toLowerCase() !== 'false' : clientImap?.tls !== false;
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 993,
    user: String(env.IMAP_USER || clientImap?.user || '').trim(),
    pass: String(env.IMAP_PASS || clientImap?.pass || ''),
    tls: tlsValue && port !== 143,
  };
}

async function findRegisteredUserEmail(db: any, identity: string): Promise<string | null> {
  if (!db || !identity) return null;
  try {
    const normalized = identity.trim().toLowerCase();
    const row = await db.prepare(
      `SELECT id, username, email FROM fox3_users
       WHERE id = ? OR LOWER(username) = ? OR LOWER(email) = ? LIMIT 1`
    ).bind(identity.trim(), normalized, normalized).first();
    return normalizeEmail(row?.email) || null;
  } catch {
    return null;
  }
}

async function ensureVerificationTables(db: any): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_email_verifications (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expiresAt INTEGER NOT NULL,
    lastSentAt INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_email_ip_rates (
    ipHash TEXT PRIMARY KEY,
    expiresAt INTEGER NOT NULL
  )`).run();
}

async function ensureUsersTable(db: any): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_users (
    id TEXT PRIMARY KEY,
    username TEXT,
    email TEXT,
    password TEXT,
    role TEXT DEFAULT 'user',
    createdAt INTEGER,
    status TEXT DEFAULT 'active'
  )`).run();

  const info = await db.prepare('PRAGMA table_info(fox3_users)').all();
  const columns = new Set((info?.results || []).map((column: any) => String(column.name)));
  const additions: Array<[string, string]> = [
    ['id', 'TEXT'],
    ['username', 'TEXT'],
    ['email', 'TEXT'],
    ['password', 'TEXT'],
    ['role', "TEXT DEFAULT 'user'"],
    ['createdAt', 'INTEGER'],
    ['status', "TEXT DEFAULT 'active'"],
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      await db.prepare(`ALTER TABLE fox3_users ADD COLUMN ${name} ${definition}`).run();
    }
  }
  // Non-unique indexes are safe to add even when legacy data has duplicates.
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_users_email_idx ON fox3_users(email)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS fox3_users_username_idx ON fox3_users(username)').run();
}

function isValidEmail(value: string): boolean {
  if (!value || value.length > 254 || /[\s<>]/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || !domain.includes('.')) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return domain.split('.').every(label => label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

async function ensurePasswordResetTable(db: any): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS fox3_password_resets (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expiresAt INTEGER NOT NULL,
    lastSentAt INTEGER NOT NULL
  )`).run();
}

async function hashRateLimitIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function reserveVerificationCode(env: any, email: string, ip: string, code: string): Promise<'d1' | 'kv' | null> {
  const now = Date.now();
  if (env.DB) {
    await ensureVerificationTables(env.DB);
    const ipHash = await hashRateLimitIp(ip);
    const [emailRow, ipRow] = await Promise.all([
      env.DB.prepare('SELECT lastSentAt FROM fox3_email_verifications WHERE email = ?').bind(email).first(),
      env.DB.prepare('SELECT expiresAt FROM fox3_email_ip_rates WHERE ipHash = ?').bind(ipHash).first(),
    ]);
    if ((emailRow && now - Number(emailRow.lastSentAt) < 60_000) || (ipRow && Number(ipRow.expiresAt) > now)) return null;

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO fox3_email_verifications (email, code, attempts, expiresAt, lastSentAt)
        VALUES (?, ?, 0, ?, ?)
        ON CONFLICT(email) DO UPDATE SET code = excluded.code, attempts = 0,
          expiresAt = excluded.expiresAt, lastSentAt = excluded.lastSentAt`)
        .bind(email, code, now + 600_000, now),
      env.DB.prepare(`INSERT INTO fox3_email_ip_rates (ipHash, expiresAt) VALUES (?, ?)
        ON CONFLICT(ipHash) DO UPDATE SET expiresAt = excluded.expiresAt`)
        .bind(ipHash, now + 60_000),
    ]);
    return 'd1';
  }

  if (!env.KV) return null;
  const codeKey = `verify_code_${email}`;
  const attemptKey = `verify_attempt_${email}`;
  const rateEmailKey = `mail_rate_email_${encodeURIComponent(email)}`;
  const rateIpKey = `mail_rate_ip_${encodeURIComponent(ip)}`;
  const [emailRate, ipRate] = await Promise.all([env.KV.get(rateEmailKey), env.KV.get(rateIpKey)]);
  if (emailRate || ipRate) return null;
  await Promise.all([
    env.KV.put(rateEmailKey, '1', { expirationTtl: 60 }),
    env.KV.put(rateIpKey, '1', { expirationTtl: 60 }),
  ]);
  await env.KV.delete(attemptKey);
  await env.KV.put(codeKey, code, { expirationTtl: 600 });
  return 'kv';
}

async function verifyStoredCode(env: any, email: string, code: string): Promise<boolean> {
  if (env.DB) {
    await ensureVerificationTables(env.DB);
    const row = await env.DB.prepare('SELECT code, attempts, expiresAt FROM fox3_email_verifications WHERE email = ?').bind(email).first();
    if (row) {
      if (Number(row.expiresAt) <= Date.now() || Number(row.attempts) >= 10 || !row.code) return false;
      if (code && code === String(row.code)) return true;
      const nextAttempts = Number(row.attempts) + 1;
      await env.DB.prepare(`UPDATE fox3_email_verifications
        SET attempts = ?, code = CASE WHEN ? >= 10 THEN '' ELSE code END
        WHERE email = ? AND expiresAt > ?`).bind(nextAttempts, nextAttempts, email, Date.now()).run();
      return false;
    }
  }

  if (!env.KV) return false;
  const kv = env.KV;
  const codeKey = `verify_code_${email}`;
  const attemptKey = `verify_attempt_${email}`;
  const attempts = Number(await kv.get(attemptKey)) || 0;
  if (attempts >= 10) return false;
  const storedCode = await kv.get(codeKey);
  if (storedCode && code === storedCode) return true;
  const nextAttempts = attempts + 1;
  await kv.put(attemptKey, String(nextAttempts), { expirationTtl: 600 });
  if (nextAttempts >= 10) await kv.delete(codeKey);
  return false;
}

async function consumeStoredCode(env: any, email: string): Promise<void> {
  if (env.DB) {
    await ensureVerificationTables(env.DB);
    const result = await env.DB.prepare(`UPDATE fox3_email_verifications
      SET code = '', attempts = 10 WHERE email = ?`).bind(email).run();
    if (Number(result?.meta?.changes || 0) > 0) return;
  }
  if (env.KV) {
    await Promise.all([env.KV.delete(`verify_code_${email}`), env.KV.delete(`verify_attempt_${email}`)]);
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createAdminSessionToken(env: any): Promise<string> {
  const secret = getAdminSessionSecret(env);
  if (!secret) return '';
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ role: 'admin', exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${payload}.${base64UrlEncode(signature)}`;
}

function getConfiguredAdminPassword(env: any): string {
  const password = typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : String(env.ADMIN_PASSWORD ?? '');
  return password.length < 6 ? '' : password;
}

function getAdminSessionSecret(env: any): string {
  const configuredSecret = String(env.ADMIN_SESSION_SECRET || '').trim();
  return configuredSecret.length >= 32 ? configuredSecret : '';
}

async function hasAdminSession(request: Request, env: any): Promise<boolean> {
  const secret = getAdminSessionSecret(env);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secret || !token) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - signature.length % 4) % 4)), ch => ch.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(payload));
    if (!valid) return false;
    const payloadBytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4)), ch => ch.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
    return claims.role === 'admin' && Number(claims.exp) > Date.now();
  } catch {
    return false;
  }
}

async function createUserSessionToken(env: any, userId: string): Promise<string> {
  const secret = getAdminSessionSecret(env);
  if (!secret || !userId) return '';
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ role: 'user', sub: userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${payload}.${base64UrlEncode(signature)}`;
}

async function getAuthenticatedUser(request: Request, env: any): Promise<{ id: string; username: string } | null> {
  const secret = getAdminSessionSecret(env);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secret || !token || !env.DB) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - signature.length % 4) % 4)), ch => ch.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(payload))) return null;
    const payloadBytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4)), ch => ch.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (claims.role !== 'user' || typeof claims.sub !== 'string' || Number(claims.exp) <= Date.now()) return null;
    await ensureUsersTable(env.DB);
    const user = await env.DB.prepare("SELECT id, username, role, status FROM fox3_users WHERE id = ? LIMIT 1").bind(claims.sub).first();
    if (!user || user.role !== 'user' || user.status !== 'active') return null;
    return { id: String(user.id), username: String(user.username) };
  } catch {
    return null;
  }
}

async function readJsonRequestLimited(request: Request, maxBytes: number): Promise<any> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw Object.assign(new Error('请求体超过大小限制'), { code: 'PAYLOAD_TOO_LARGE' });
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw Object.assign(new Error('请求体超过大小限制'), { code: 'PAYLOAD_TOO_LARGE' });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error('JSON 请求体格式错误'), { code: 'INVALID_JSON' }); }
}

async function hashUserPassword(password: string): Promise<string> {
  // Cloudflare Workers Web Crypto currently rejects PBKDF2 counts above 100,000.
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
  return `pbkdf2$${iterations}$${base64UrlEncode(salt)}$${base64UrlEncode(bits)}`;
}

async function verifyUserPassword(db: any, userRow: any, password: string): Promise<boolean> {
  const stored = String(userRow?.password || '');
  if (!stored.startsWith('pbkdf2$')) {
    if (stored !== password) return false;
    const upgraded = await hashUserPassword(password);
    await db.prepare('UPDATE fox3_users SET password = ? WHERE id = ?').bind(upgraded, userRow.id).run();
    return true;
  }
  try {
    const [, rounds, saltValue, hashValue] = stored.split('$');
    const saltBase64 = saltValue.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - saltValue.length % 4) % 4);
    const hashBase64 = hashValue.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - hashValue.length % 4) % 4);
    const salt = Uint8Array.from(atob(saltBase64), ch => ch.charCodeAt(0));
    const expected = Uint8Array.from(atob(hashBase64), ch => ch.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(rounds), hash: 'SHA-256' }, key, expected.length * 8));
    if (actual.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i];
    return mismatch === 0;
  } catch {
    return false;
  }
}

function applyFileSafetyHeaders(headers: Headers): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i++) mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return mismatch === 0;
}

async function verifyResendWebhookSignature(request: Request, rawBody: string, secret: string): Promise<boolean> {
  try {
    const messageId = request.headers.get('svix-id') || '';
    const timestamp = request.headers.get('svix-timestamp') || '';
    const signatureHeader = request.headers.get('svix-signature') || '';
    const timestampNumber = Number(timestamp);
    if (!messageId || !/^\d+$/.test(timestamp) || !Number.isFinite(timestampNumber)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;
    if (!secret.startsWith('whsec_')) return false;

    const secretBytes = Uint8Array.from(atob(secret.slice('whsec_'.length)), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signedContent = new TextEncoder().encode(`${messageId}.${timestamp}.${rawBody}`);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, signedContent));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    const expectedSignature = btoa(binary);
    return signatureHeader.split(' ').some(part => {
      const [version, signature] = part.split(',', 2);
      return version === 'v1' && Boolean(signature) && constantTimeStringEqual(signature, expectedSignature);
    });
  } catch {
    return false;
  }
}

function emailHtmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function findBindingByAliases(rawEnv: Record<string, any>, aliases: string[]): any {
  for (const name of aliases) {
    if (rawEnv[name] !== undefined && rawEnv[name] !== null) return rawEnv[name];
  }
  const lowerMap = new Map<string, any>();
  for (const [k, v] of Object.entries(rawEnv)) {
    if (v !== undefined && v !== null) lowerMap.set(k.toLowerCase(), v);
  }
  for (const name of aliases) {
    const hit = lowerMap.get(name.toLowerCase());
    if (hit !== undefined && hit !== null) return hit;
  }
  return undefined;
}

function isD1Binding(val: any): boolean {
  return Boolean(val && typeof val === 'object' && typeof val.prepare === 'function' && typeof val.batch === 'function');
}

function isR2Binding(val: any): boolean {
  return Boolean(val && typeof val === 'object' && typeof val.put === 'function' && typeof val.list === 'function' && typeof val.head === 'function' && typeof val.prepare !== 'function');
}

function isKvBinding(val: any): boolean {
  return Boolean(val && typeof val === 'object' && typeof val.get === 'function' && typeof val.put === 'function' && typeof val.delete === 'function' && typeof val.list === 'function' && typeof val.head !== 'function' && typeof val.prepare !== 'function');
}

function resolveCloudflareBindings(rawEnv: Record<string, any>) {
  let db = findBindingByAliases(rawEnv, ['DB', 'D1', 'DATABASE', 'FOX3_DB', 'D1_DATABASE', 'D1_DB', 'SQLITE']);
  if (!isD1Binding(db)) {
    db = Object.values(rawEnv).find(isD1Binding) || db;
  }

  let r2 = findBindingByAliases(rawEnv, ['R2_BUCKET', 'R2', 'BUCKET', 'FOX3_R2', 'R2_STORAGE', 'STORAGE', 'FILES']);
  if (!isR2Binding(r2)) {
    r2 = Object.values(rawEnv).find(isR2Binding) || r2;
  }

  let kv = findBindingByAliases(rawEnv, ['KV', 'FOX3_KV', 'KV_NAMESPACE', 'MY_KV', 'CACHE']);
  if (!isKvBinding(kv)) {
    kv = Object.values(rawEnv).find(isKvBinding) || kv;
  }

  return {
    ...rawEnv,
    DB: db,
    R2_BUCKET: r2,
    KV: kv,
  };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export const onRequest = async (context: any) => {
  const { request } = context;
  const rawEnv: Env = context.env || {};
  // Normalize bindings so standard or custom Cloudflare Pages binding names connect seamlessly
  const env: any = resolveCloudflareBindings(rawEnv);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');

  // CORS Headers
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-WebDAV-Config, X-WebDAV-Path',
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  const commerceResponse = await handleCommerceRequest(request, path, env, headers, {
    isAdmin: req => hasAdminSession(req, env),
    getUser: req => getAuthenticatedUser(req, env),
    defaultAdminEmail: String(env.MAIL_SENDER || '').trim(),
    sendMail: async (to, subject, text, html) => {
      const result = await dispatchEmail(getOutboundSettings({}, env), { to, subject, text, html });
      return { success: result.success, error: result.error };
    },
  });
  if (commerceResponse) return commerceResponse;
  // WebDAV proxy: keeps remote Basic Auth out of third-party browser requests and
  // restricts every operation to a signed administrator session.
  if (path.startsWith('/webdav/')) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (!await hasAdminSession(request, env)) {
      return Response.json({ success: false, error: 'WebDAV 管理操作需要有效的管理员会话' }, { status: 401, headers });
    }
    const action = path.slice('/webdav/'.length).split('/')[0];
    return handleWebDavAction(action, request, headers);
  }

  if ((path === '/mail/webhook' || path === '/webhook') && request.method === 'POST') {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 1_048_576) {
      return new Response('Webhook payload too large', { status: 413, headers });
    }
    if (!env.RESEND_WEBHOOK_SECRET) {
      return new Response('Resend webhook signing secret is not configured', { status: 503, headers });
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_048_576) {
      return new Response('Webhook payload too large', { status: 413, headers });
    }
    if (!await verifyResendWebhookSignature(request, rawBody, env.RESEND_WEBHOOK_SECRET)) {
      return new Response('Invalid webhook signature', { status: 401, headers });
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return new Response('Invalid webhook JSON', { status: 400, headers }); }
    if (event?.type !== 'email.received') {
      return new Response(JSON.stringify({ success: true, ignored: true }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    const resendEmailId = String(event?.data?.email_id || '').trim();
    const eventId = request.headers.get('svix-id') || '';
    if (!resendEmailId || resendEmailId.length > 200 || !eventId || eventId.length > 200) {
      return new Response('Invalid received email event', { status: 400, headers });
    }
    if (!env.DB) return new Response('D1 binding DB is required for inbound email storage', { status: 503, headers });
    const resendApiKey = String(env.RESEND_API_KEY || '').trim();
    if (!resendApiKey) return new Response('RESEND_API_KEY is required to retrieve inbound email content', { status: 503, headers });

    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_inbound_emails (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]',
        receivedAt INTEGER NOT NULL
      )`).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS fox3_inbound_emails_received_at ON fox3_inbound_emails(receivedAt DESC)').run();
      const duplicate = await env.DB.prepare('SELECT id FROM fox3_inbound_emails WHERE id = ? OR eventId = ? LIMIT 1').bind(resendEmailId, eventId).first();
      if (duplicate) return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });

      const contentResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(resendEmailId)}?html_format=cid`, {
        headers: { Authorization: `Bearer ${resendApiKey}`, Accept: 'application/json' },
      });
      if (!contentResponse.ok) {
        console.warn(`[Mail Backend] Resend inbound retrieval failed with HTTP ${contentResponse.status}`);
        return new Response('Unable to retrieve received email from Resend', { status: 502, headers });
      }
      const contentText = await contentResponse.text();
      if (contentText.length > 4_000_000) return new Response('Received email content exceeds storage processing limit', { status: 413, headers });
      const received: any = JSON.parse(contentText);
      const sender = String(received?.from || event?.data?.from || '').slice(0, 500);
      const recipients = Array.isArray(received?.to) ? received.to : Array.isArray(event?.data?.to) ? event.data.to : [];
      const recipient = recipients.map((item: any) => String(item)).join(', ').slice(0, 1000);
      const subject = String(received?.subject || event?.data?.subject || '(无主题)').replace(/[\r\n]+/g, ' ').slice(0, 500);
      const sourceBody = typeof received?.text === 'string' && received.text.trim()
        ? received.text
        : emailHtmlToText(typeof received?.html === 'string' ? received.html : '');
      const body = sourceBody.slice(0, 250_000);
      const attachments = JSON.stringify((Array.isArray(received?.attachments) ? received.attachments : []).slice(0, 100).map((item: any) => ({
        id: String(item?.id || '').slice(0, 200),
        filename: String(item?.filename || '').slice(0, 300),
        contentType: String(item?.content_type || '').slice(0, 200),
        contentDisposition: String(item?.content_disposition || '').slice(0, 100),
        contentId: String(item?.content_id || '').slice(0, 200),
        size: Math.max(0, Number(item?.size) || 0),
      })));
      const parsedDate = Date.parse(String(received?.created_at || event?.data?.created_at || ''));
      const receivedAt = Number.isFinite(parsedDate) ? parsedDate : Date.now();
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO fox3_inbound_emails
        (id, eventId, sender, recipient, subject, body, attachments, receivedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(resendEmailId, eventId, sender, recipient, subject, body, attachments, receivedAt).run();
      await env.DB.prepare('DELETE FROM fox3_inbound_emails WHERE receivedAt < ?').bind(Date.now() - 180 * 24 * 60 * 60 * 1000).run();
      await env.DB.prepare('DELETE FROM fox3_inbound_emails WHERE id NOT IN (SELECT id FROM fox3_inbound_emails ORDER BY receivedAt DESC LIMIT 500)').run();
      return new Response(JSON.stringify({ success: true, stored: Number(insert?.meta?.changes || 0) > 0 }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch (error: any) {
      console.error(`[Mail Backend] Failed to store Resend inbound email: ${String(error?.message || error).slice(0, 180)}`);
      return new Response('Failed to process received email', { status: 500, headers });
    }
  }

  if (path === '/auth/session' && request.method === 'GET') {
    const authenticated = await hasAdminSession(request, env);
    if (!authenticated) {
      return new Response(JSON.stringify({ success: false, authenticated: false, error: '管理员会话无效或已过期' }), {
        status: 401,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    }
    const username = (env.ADMIN_USERNAME || 'fox').trim().toLowerCase();
    return new Response(JSON.stringify({
      success: true,
      authenticated: true,
      user: { id: 'user_fox_admin', username, email: 'service@whitefox.blog', role: 'admin', createdAt: Date.now(), status: 'active' }
    }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
  }

  if (path === '/auth/user-session' && request.method === 'GET') {
    const authenticatedUser = await getAuthenticatedUser(request, env);
    if (!authenticatedUser) return Response.json({ success: false, authenticated: false, error: '用户会话无效或已过期' }, { status: 401, headers });
    return Response.json({ success: true, authenticated: true, user: { ...authenticatedUser, role: 'user' } }, { headers });
  }

  // Admin credentials verification & backend variable resolver endpoint
  // Ensures single admin uniqueness. Reads ADMIN_PASSWORD and ADMIN_USERNAME from dashboard/environment variables.
  if (path === '/admin/config' || path === '/auth/admin') {
    const defaultAdminName = (env.ADMIN_USERNAME || 'fox').trim().toLowerCase();
    const hasConfiguredPassword = Boolean(getConfiguredAdminPassword(env));

    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        success: true,
        adminUsername: defaultAdminName,
        isCustomPasswordConfigured: hasConfiguredPassword,
        isSessionSecretConfigured: Boolean(getAdminSessionSecret(env)),
        singleAdminEnforced: true,
        message: `单一管理员唯一性已生效，仅允许唯一超级管理员【${defaultAdminName}】`,
      }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const { username, password } = body;

        const validPassword = getConfiguredAdminPassword(env);
        const validUser = defaultAdminName.trim().toLowerCase();

        const inputUser = (username || '').trim().toLowerCase();
        const inputPass = typeof password === 'string' ? password : '';

        // Check if user matches admin name, 'admin', 'fox', or admin email
        const isAdminUser =
          inputUser === validUser ||
          inputUser === 'fox' ||
          inputUser === 'admin' ||
          inputUser === 'service@whitefox.blog' ||
          !inputUser; // Allow direct password verification for admin endpoint

        const credentialsMatch = Boolean(validPassword) && isAdminUser && inputPass === validPassword;
        const sessionToken = credentialsMatch ? await createAdminSessionToken(env) : '';
        const isMatch = credentialsMatch && Boolean(sessionToken);

        return new Response(JSON.stringify({
          success: isMatch,
          adminUsername: defaultAdminName,
          authenticated: isMatch,
          sessionToken: sessionToken || undefined,
          user: isMatch ? {
            id: 'user_fox_admin',
            username: defaultAdminName,
            email: 'service@whitefox.blog',
            role: 'admin',
            createdAt: Date.now(),
            status: 'active',
          } : null,
          message: isMatch ? '管理员身份鉴权成功' : credentialsMatch ? '请独立配置至少 32 个字符的 ADMIN_SESSION_SECRET（不可使用 ADMIN_PASSWORD 代替）' : '管理员账号或密码不正确',
        }), {
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 400,
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      }
    }
  }

  // Unified login endpoint: supports username or email + password, checks deployment ADMIN_PASSWORD
  if (path === '/auth/login' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { account, password } = body;

      const validAdminName = (env.ADMIN_USERNAME || 'fox').trim().toLowerCase();
      const validAdminPass = getConfiguredAdminPassword(env);

      const inputAccount = (account || '').trim().toLowerCase();
      const inputPass = typeof password === 'string' ? password : '';

      // Check admin credentials
      const isAdminAccount =
        inputAccount === validAdminName ||
        inputAccount === 'fox' ||
        inputAccount === 'admin' ||
        inputAccount === 'service@whitefox.blog';

      if (isAdminAccount && validAdminPass && inputPass === validAdminPass) {
        const sessionToken = await createAdminSessionToken(env);
        if (!sessionToken) {
          return new Response(JSON.stringify({ success: false, authenticated: false, message: '请独立配置至少 32 个字符的 ADMIN_SESSION_SECRET（不可使用 ADMIN_PASSWORD 代替）' }), {
            status: 503,
            headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({
          success: true,
          authenticated: true,
          sessionToken,
          user: {
            id: 'user_fox_admin',
            username: validAdminName,
            email: 'service@whitefox.blog',
            role: 'admin',
            createdAt: Date.now(),
            status: 'active',
          },
          message: '超级管理员登录成功',
        }), {
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      }

      // Check regular user from D1 database if bound
      if (env.DB) {
        try {
          await ensureUsersTable(env.DB);

          const userRow = await env.DB.prepare(
            `SELECT id, username, email, password, role, createdAt, status FROM fox3_users
             WHERE LOWER(username) = ? OR LOWER(email) = ?`
          ).bind(inputAccount, inputAccount).first();

          if (userRow) {
            if (userRow.role === 'admin') {
              return new Response(JSON.stringify({ success: false, authenticated: false, message: '管理员账号必须通过部署端 ADMIN_PASSWORD 验证' }), {
                status: 401,
                headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
              });
            }
            if (userRow.status !== 'active') return new Response(JSON.stringify({ success: false, authenticated: false, message: '该账户已停用，请联系管理员' }), { status: 403, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
            if (await verifyUserPassword(env.DB, userRow, inputPass)) {
              const userSessionToken = await createUserSessionToken(env, String(userRow.id));
              if (!userSessionToken) return Response.json({ success: false, authenticated: false, message: '用户云端同步会话不可用，请检查 ADMIN_SESSION_SECRET 配置' }, { status: 503, headers });
              return new Response(JSON.stringify({
                success: true,
                authenticated: true,
                userSessionToken,
                user: {
                  id: userRow.id,
                  username: userRow.username,
                  email: userRow.email,
                  role: userRow.role,
                  createdAt: userRow.createdAt,
                  status: userRow.status,
                },
                message: '用户登录成功',
              }), {
                headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
              });
            } else {
              return new Response(JSON.stringify({
                success: false,
                authenticated: false,
                message: '密码不正确',
              }), {
                status: 401,
                headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
              });
            }
          }
        } catch (dbErr: any) {
          console.error('[Auth] User login D1 schema/query failure:', dbErr?.stack || dbErr?.message || dbErr);
          // Preserve the existing login fallback response semantics.
        }
      }

      // Return not found / fallback indicator
      return new Response(JSON.stringify({
        success: false,
        authenticated: false,
        fallbackToLocal: true,
        message: '账号或密码不正确',
      }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    }
  }

  // Send a real verification email; prefer D1 so KV quotas are reserved for fallback use.
  if (path === '/auth/send-code' && request.method === 'POST') {
    try {
      const body = await request.json() as any;
      const email = normalizeEmail(body.email);
      const username = String(body.username || '').trim().slice(0, 80);
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
        return new Response(JSON.stringify({ success: false, error: '请输入有效的邮箱地址' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      if (!env.DB && !env.KV) {
        return new Response(JSON.stringify({ success: false, error: '验证码服务未配置 Cloudflare D1 或 KV，当前无法安全发送和校验验证码' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      // Public registration uses server-side settings only. Never accept SMTP/API secrets from visitors.
      const settings = getOutboundSettings({}, env);
      const codeLength = Math.min(8, Math.max(4, Number(env.VERIFY_CODE_LENGTH) || 6));
      const code = createVerificationCode(codeLength);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const store = await reserveVerificationCode(env, email, ip, code);
      if (!store) {
        return new Response(JSON.stringify({ success: false, error: '发送过于频繁，请稍后再试' }), { status: 429, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      const templateValues: Record<string, string> = { code, username: username || '用户', email };
      const render = (value: unknown, fallback: string) => String(value || fallback).replace(/\{\{(code|username|email)\}\}/g, (_match, key) => templateValues[key] || '');
      const subject = render(env.VERIFY_EMAIL_SUBJECT, '【fox3 博客】注册验证码：{{code}}').replace(/[\r\n]+/g, ' ').slice(0, 180);
      const text = render(env.VERIFY_EMAIL_TEMPLATE, '您好 {{username}}，您的注册验证码是 {{code}}。验证码 10 分钟内有效；若非本人操作，请忽略此邮件。').slice(0, 10000);
      const html = `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.7">${escapeHtml(text)}</div>`;

      const result = await dispatchEmail(settings, { to: email, subject, text, html });
      if (!result.success) {
        if (store === 'd1') {
          await env.DB.prepare(`UPDATE fox3_email_verifications SET code = '' WHERE email = ?`).bind(email).run();
        } else {
          await Promise.all([
            env.KV.delete(`verify_code_${email}`),
            env.KV.delete(`mail_rate_email_${encodeURIComponent(email)}`),
            env.KV.delete(`mail_rate_ip_${encodeURIComponent(ip)}`),
          ]);
        }
        return new Response(JSON.stringify({ success: false, error: result.error || '邮件发送失败，请检查发信设置' }), { status: 502, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: true,
        externalDispatched: true,
        provider: result.provider,
        codeLength,
        message: `验证码已发送至 ${email}，请查收邮件`,
      }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch (err: any) {
      console.warn('[Mail Backend] Verification email failed:', err?.message || 'unknown error');
      return new Response(JSON.stringify({ success: false, error: err?.message || '验证码邮件发送失败' }), { status: 500, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  // Check a code without returning or consuming it; registration validates it again and consumes it.
  if (path === '/auth/verify-code' && request.method === 'POST') {
    try {
      const body = await request.json() as any;
      const email = normalizeEmail(body.email);
      const code = String(body.code || '').trim();
      if ((!env.DB && !env.KV) || !email || !code) {
        return new Response(JSON.stringify({ success: false, error: '验证码不存在或已过期，请重新获取' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      const valid = await verifyStoredCode(env, email, code);
      return new Response(JSON.stringify({ success: valid, error: valid ? undefined : '验证码不正确或已过期，请重新获取' }), { status: valid ? 200 : 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ success: false, error: '验证码校验失败' }), { status: 500, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  if (path === '/auth/reset/send-code' && request.method === 'POST') {
    const genericResponse = () => new Response(JSON.stringify({ success: true, message: '若账号存在，验证码已发送' }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    try {
      const body = await request.json() as any;
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ success: false, error: '请输入有效的邮箱地址' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      if (!env.DB) {
        return new Response(JSON.stringify({ success: false, error: '密码重置服务未配置 Cloudflare D1（DB）' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const settings = getOutboundSettings({}, env);
      if (!hasOutboundMailService(settings)) {
        return new Response(JSON.stringify({ success: false, error: '密码重置邮件服务未配置，请检查发信服务、发件人和密钥' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      await ensureUsersTable(env.DB);
      await ensureVerificationTables(env.DB);
      await ensurePasswordResetTable(env.DB);
      const user = await env.DB.prepare(`SELECT id FROM fox3_users WHERE LOWER(email) = ? AND role = 'user' LIMIT 1`).bind(email).first();
      if (!user) return genericResponse();

      const now = Date.now();
      const ipHash = await hashRateLimitIp(request.headers.get('CF-Connecting-IP') || 'unknown');
      const [registrationRate, resetRate, ipRate] = await Promise.all([
        env.DB.prepare('SELECT lastSentAt FROM fox3_email_verifications WHERE email = ?').bind(email).first(),
        env.DB.prepare('SELECT lastSentAt FROM fox3_password_resets WHERE email = ?').bind(email).first(),
        env.DB.prepare('SELECT expiresAt FROM fox3_email_ip_rates WHERE ipHash = ?').bind(ipHash).first(),
      ]);
      if ((registrationRate && now - Number(registrationRate.lastSentAt) < 60_000) ||
          (resetRate && now - Number(resetRate.lastSentAt) < 60_000) ||
          (ipRate && Number(ipRate.expiresAt) > now)) return genericResponse();

      const code = createVerificationCode(Math.min(8, Math.max(4, Number(env.VERIFY_CODE_LENGTH) || 6)));
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO fox3_password_resets (email, code, attempts, expiresAt, lastSentAt)
          VALUES (?, ?, 0, ?, ?)
          ON CONFLICT(email) DO UPDATE SET code = excluded.code, attempts = 0,
            expiresAt = excluded.expiresAt, lastSentAt = excluded.lastSentAt`)
          .bind(email, code, now + 600_000, now),
        env.DB.prepare(`INSERT INTO fox3_email_ip_rates (ipHash, expiresAt) VALUES (?, ?)
          ON CONFLICT(ipHash) DO UPDATE SET expiresAt = excluded.expiresAt`).bind(ipHash, now + 60_000),
      ]);

      const text = `您好，您正在重置 fox3 账户密码。密码重置验证码：${code}\n验证码 10 分钟内有效，最多可尝试 10 次。若非本人操作，请忽略此邮件。此邮件不会包含您的密码。`;
      const html = `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.7">${escapeHtml(text)}</div>`;
      const result = await dispatchEmail(settings, { to: email, subject: '【fox3 博客】密码重置验证码', text, html });
      if (!result.success) {
        await env.DB.prepare(`UPDATE fox3_password_resets SET code = '' WHERE email = ?`).bind(email).run();
        console.warn('[Auth] Password reset email dispatch failed:', result.error || 'mail dispatch failed');
        return new Response(JSON.stringify({ success: false, error: '验证码邮件发送失败，请稍后重试' }), { status: 502, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      return genericResponse();
    } catch (err: any) {
      console.error('[Auth] Password reset code request failed:', err?.stack || err?.message || err);
      return new Response(JSON.stringify({ success: false, error: '密码重置验证码服务暂不可用，请稍后重试' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  if (path === '/auth/reset-password' && request.method === 'POST') {
    try {
      const body = await request.json() as any;
      const email = normalizeEmail(body.email);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!isValidEmail(email) || !code || newPassword.length < 6) {
        return new Response(JSON.stringify({ success: false, error: !isValidEmail(email) ? '请输入有效的邮箱地址' : !code ? '请输入验证码' : '新密码长度至少需 6 位字符' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      if (!env.DB) {
        return new Response(JSON.stringify({ success: false, error: '密码重置服务未配置 Cloudflare D1（DB）' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      await ensureUsersTable(env.DB);
      await ensurePasswordResetTable(env.DB);
      const user = await env.DB.prepare(`SELECT id FROM fox3_users WHERE LOWER(email) = ? AND role = 'user' LIMIT 1`).bind(email).first();
      const row = await env.DB.prepare('SELECT code, attempts, expiresAt FROM fox3_password_resets WHERE email = ?').bind(email).first();
      const now = Date.now();
      if (!row) {
        return new Response(JSON.stringify({ success: false, error: '验证码无效或已过期，请重新获取' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      const attempts = Number(row.attempts) || 0;
      if (Number(row.expiresAt) <= now || attempts >= 10 || !row.code) {
        await env.DB.prepare(`UPDATE fox3_password_resets SET code = '', attempts = 10 WHERE email = ?`).bind(email).run();
        return new Response(JSON.stringify({ success: false, error: '验证码无效或已过期，请重新获取' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      if (!user || String(row.code) !== code) {
        const nextAttempts = attempts + 1;
        await env.DB.prepare(`UPDATE fox3_password_resets SET attempts = ?, code = CASE WHEN ? >= 10 THEN '' ELSE code END WHERE email = ? AND expiresAt > ?`)
          .bind(nextAttempts, nextAttempts, email, now).run();
        return new Response(JSON.stringify({ success: false, error: '验证码无效或已过期，请重新获取' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const passwordHash = await hashUserPassword(newPassword);
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE fox3_users SET password = ? WHERE id = ? AND role = 'user'
          AND EXISTS (SELECT 1 FROM fox3_password_resets WHERE email = ? AND code = ? AND expiresAt > ? AND attempts < 10)`)
          .bind(passwordHash, user.id, email, code, now),
        env.DB.prepare(`UPDATE fox3_password_resets SET code = '', attempts = 10 WHERE email = ? AND code = ? AND expiresAt > ? AND attempts < 10`)
          .bind(email, code, now),
      ]);
      if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
        return new Response(JSON.stringify({ success: false, error: '验证码无效或已过期，请重新获取' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, message: '密码已重置，请使用新密码登录' }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch (err: any) {
      console.error('[Auth] Password reset failed:', err?.stack || err?.message || err);
      return new Response(JSON.stringify({ success: false, error: '密码重置失败，请稍后重试' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  // Registration endpoint (Option A: strictly forbid registering admin reserved names)
  if (path === '/auth/register' && request.method === 'POST') {
    try {
      const body = await request.json() as any;
      const { username, email, password, verificationCode } = body;

      const validAdminName = (env.ADMIN_USERNAME || 'fox').trim().toLowerCase();

      const inputUser = typeof username === 'string' ? username.trim() : '';
      const inputEmail = normalizeEmail(email);
      const inputPass = typeof password === 'string' ? password.trim() : '';

      if (!env.DB) {
        return new Response(JSON.stringify({ success: false, error: '注册服务暂不可用：必须配置 Cloudflare D1（DB）以安全保存账户' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      if (inputUser.length < 2) {
        return new Response(JSON.stringify({ success: false, error: '用户名至少需要 2 个字符' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      if (inputPass.length < 6) {
        return new Response(JSON.stringify({ success: false, error: '密码长度至少需 6 位字符' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      // Forbid registration of reserved administrator names
      if (
        inputUser.toLowerCase() === validAdminName ||
        inputUser.toLowerCase() === 'fox' ||
        inputUser.toLowerCase() === 'admin'
      ) {
        return new Response(JSON.stringify({
          success: false,
          error: '系统保留账号不可注册，超级管理员请直接通过登录页面鉴权进入。'
        }), {
          status: 400,
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      }

      if (email != null && String(email).trim() !== '' && !isValidEmail(inputEmail)) {
        return new Response(JSON.stringify({ success: false, error: '请输入格式正确的邮箱地址' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      if (inputEmail) {
        if (!isValidEmail(inputEmail)) {
          return new Response(JSON.stringify({ success: false, error: '请输入格式正确的邮箱地址' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
        }
        if (!env.DB && !env.KV) {
          return new Response(JSON.stringify({ success: false, error: '验证码服务未配置' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
        }
        const validCode = await verifyStoredCode(env, inputEmail, String(verificationCode || '').trim());
        if (!validCode) {
          return new Response(JSON.stringify({ success: false, error: '验证码不正确或已过期，请重新获取' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
        }
      }

      const assignedRole = 'user';

      try {
        await ensureUsersTable(env.DB);
      } catch (dbErr: any) {
        console.error('[Auth] Registration users-table migration failed:', dbErr?.stack || dbErr?.message || dbErr);
        return new Response(JSON.stringify({ success: false, error: '账户数据库结构初始化失败，请联系管理员检查 fox3_users 表结构或稍后重试' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM fox3_users WHERE LOWER(username) = ? OR (? <> '' AND LOWER(email) = ?) LIMIT 1`
      ).bind(inputUser.toLowerCase(), inputEmail, inputEmail).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '该用户名或邮箱已被注册' }), { status: 409, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const userId = `user_${crypto.randomUUID()}`;
      const createdAt = Date.now();
      const passwordHash = await hashUserPassword(inputPass);
      try {
        await env.DB.prepare(
          `INSERT INTO fox3_users (id, username, email, password, role, createdAt, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(userId, inputUser, inputEmail, passwordHash, assignedRole, createdAt, 'active').run();
      } catch (dbErr: any) {
        console.error('[Auth] Registration D1 insert failed:', dbErr?.stack || dbErr?.message || dbErr);
        return new Response(JSON.stringify({ success: false, error: '账户无法写入数据库，请检查 fox3_users 表结构及数据库配置后重试' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      if (inputEmail) {
        try {
          await consumeStoredCode(env, inputEmail);
        } catch {}
      }

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: userId,
          username: inputUser,
          email: inputEmail,
          role: assignedRole,
          createdAt,
          status: 'active',
        },
        message: '用户注册成功',
      }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    }
  }

  // D1-backed registered-user management. Never expose password hashes to the client.
  if (path === '/admin/users' && ['GET', 'PATCH', 'DELETE'].includes(request.method)) {
    const jsonResponse = (payload: any, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
    });
    if (!await hasAdminSession(request, env)) {
      return jsonResponse({ success: false, error: '需要有效的管理员会话' }, 401);
    }
    if (!env.DB) {
      return jsonResponse({ success: false, error: '用户数据库不可用，请检查 D1 绑定 DB' }, 503);
    }

    try {
      await ensureUsersTable(env.DB);
      if (request.method === 'GET') {
        const result = await env.DB.prepare(`SELECT id, username, email, role, createdAt, status
          FROM fox3_users ORDER BY COALESCE(createdAt, 0) DESC LIMIT 1000`).all();
        const users = (result?.results || []).map((row: any) => ({
          id: String(row.id || ''),
          username: String(row.username || ''),
          email: String(row.email || ''),
          role: row.role === 'admin' ? 'admin' : 'user',
          createdAt: Number(row.createdAt) || 0,
          status: row.status === 'disabled' ? 'disabled' : 'active',
        }));
        return jsonResponse({ success: true, users });
      }

      const body = await request.json() as any;
      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      if (!id || id.length > 200) return jsonResponse({ success: false, error: '用户 ID 无效' }, 400);

      if (request.method === 'PATCH') {
        const status = body?.status;
        if (status !== 'active' && status !== 'disabled') {
          return jsonResponse({ success: false, error: '账号状态只能设置为 active 或 disabled' }, 400);
        }
        const result = await env.DB.prepare(`UPDATE fox3_users SET status = ? WHERE id = ? AND COALESCE(role, 'user') <> 'admin'`)
          .bind(status, id).run();
        if (Number(result?.meta?.changes || 0) !== 1) {
          return jsonResponse({ success: false, error: '用户不存在，或不可修改管理员账号' }, 404);
        }
        return jsonResponse({ success: true, id, status });
      }

      const result = await env.DB.prepare(`DELETE FROM fox3_users WHERE id = ? AND COALESCE(role, 'user') <> 'admin'`)
        .bind(id).run();
      if (Number(result?.meta?.changes || 0) !== 1) {
        return jsonResponse({ success: false, error: '用户不存在，或不可删除管理员账号' }, 404);
      }
      return jsonResponse({ success: true, id });
    } catch (err: any) {
      console.error('[Admin] D1 user management failed:', err?.stack || err?.message || err);
      return jsonResponse({ success: false, error: 'D1 用户管理操作失败，请检查 fox3_users 表结构和 DB 绑定' }, 503);
    }
  }

  // Health check & genuine connectivity status indicator
  // Each cloud service is reported only after a live read-only connectivity probe.
  if (path === '/status' || path === '') {
    let d1Healthy = false;
    let r2Healthy = false;
    let kvHealthy = false;
    let externalObjectStorageHealthy = false;
    const probeErrors: Record<string, string> = {};
    const externalObjectStore = getExternalObjectStoreConfig(env);

    // Active live connectivity probing
    if (env.DB) {
      try {
        await env.DB.prepare('SELECT 1').first();
        d1Healthy = true;
      } catch (err: any) {
        d1Healthy = false;
        probeErrors.d1 = String(err?.message || err || 'D1 probe failed').slice(0, 140);
      }
    } else {
      probeErrors.d1 = '未检测到 D1 数据库绑定（请在 Pages Settings -> Bindings 添加变量名 DB）';
    }

    if (env.R2_BUCKET) {
      try {
        await env.R2_BUCKET.list({ limit: 1 });
        r2Healthy = true;
      } catch (err: any) {
        r2Healthy = false;
        probeErrors.r2 = String(err?.message || err || 'R2 probe failed').slice(0, 140);
      }
    } else {
      probeErrors.r2 = '未检测到 R2 存储桶绑定（请在 Pages Settings -> Bindings 添加变量名 R2_BUCKET）';
    }

    if (env.KV) {
      try {
        await env.KV.get('__fox3_probe__');
        kvHealthy = true;
      } catch (err: any) {
        kvHealthy = false;
        probeErrors.kv = String(err?.message || err || 'KV probe failed').slice(0, 140);
      }
    } else {
      probeErrors.kv = '未检测到 KV 命名空间绑定（请在 Pages Settings -> Bindings 添加变量名 KV）';
    }

    const adminAuthorized = await hasAdminSession(request, env);
    if (externalObjectStore && adminAuthorized) {
      try {
        externalObjectStorageHealthy = await probeExternalObjectStore(externalObjectStore);
      } catch {
        externalObjectStorageHealthy = false;
      }
    }
    const channelOnline = d1Healthy || r2Healthy || kvHealthy || externalObjectStorageHealthy;

    return new Response(JSON.stringify({
      success: true,
      status: channelOnline ? 'online' : 'offline',
      channelOnline,
      version: '3.8.2',
      cloudServices: {
        d1: d1Healthy,
        r2: r2Healthy,
        kv: kvHealthy,
        objectStorage: externalObjectStorageHealthy,
        objectStorageProvider: externalObjectStore?.provider || null,
      },
      bindingDetected: {
        d1: isD1Binding(env.DB),
        r2: isR2Binding(env.R2_BUCKET),
        kv: isKvBinding(env.KV),
      },
      ...(adminAuthorized && Object.keys(probeErrors).length > 0 ? { probeErrors } : {}),
      message: channelOnline
        ? '云端存储绑定探测完成；请查看 cloudServices 各项状态'
        : 'D1、R2、KV 与外部对象存储均未通过探测；请检查 Pages Settings -> Bindings 并重新部署',
      timestamp: Date.now(),
    }), {
      headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
    });
  }

  // Registered users store only their own media metadata in a separate D1 row.
  // The file bytes remain in the configured object store; this endpoint never accepts inline file data.
  if (path === '/user-media') {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return Response.json({ success: false, error: '请重新登录后同步个人媒体' }, { status: 401, headers });
    if (!env.DB) return Response.json({ success: false, error: '个人媒体跨设备同步需要 D1（DB）' }, { status: 503, headers });
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_user_media (
        userId TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updatedAt INTEGER NOT NULL
      )`).run();
      const current = await env.DB.prepare('SELECT value, revision, updatedAt FROM fox3_user_media WHERE userId = ?').bind(user.id).first();
      if (request.method === 'GET') {
        return Response.json({ success: true, initialized: Boolean(current?.value), revision: Number(current?.revision || 0), updatedAt: Number(current?.updatedAt || 0), data: current?.value ? JSON.parse(String(current.value)) : { books: [], photos: [], media: [] } }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
      }
      if (request.method !== 'POST') return Response.json({ success: false, error: 'Method not allowed' }, { status: 405, headers });
      const length = Number(request.headers.get('content-length') || 0);
      if (length > 2 * 1024 * 1024) return Response.json({ success: false, error: '个人媒体目录超过 2 MiB 限制；文件本体必须上传到对象存储' }, { status: 413, headers });
      const published = await env.DB.prepare('SELECT value FROM fox3_site_content WHERE id = ?').bind('published').first();
      const siteSettings = published?.value ? JSON.parse(String(published.value))?.systemSettings : null;
      if (siteSettings?.allowUserMediaManagement !== true) return Response.json({ success: false, error: '管理员尚未开启注册用户文件管理' }, { status: 403, headers });
      let body: any;
      try { body = await readJsonRequestLimited(request, 2 * 1024 * 1024); }
      catch (error: any) {
        const tooLarge = error?.code === 'PAYLOAD_TOO_LARGE';
        return Response.json({ success: false, error: tooLarge ? '个人媒体目录超过 2 MiB 限制；文件本体必须上传到对象存储' : '请求 JSON 格式无效' }, { status: tooLarge ? 413 : 400, headers });
      }
      const expectedRevision = Number(body?.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return Response.json({ success: false, error: '个人媒体版本号无效，请重新加载' }, { status: 400, headers });
      const definitions: Record<string, string[]> = {
        books: ['id','title','author','format','cover','description','fileSize','fileUrl','displayFilename','createdAt','updatedAt'],
        photos: ['id','title','url','originalFilename','thumbnail','category','folderId','folderName','width','height','description','createdAt','updatedAt'],
        media: ['id','type','title','artist','src','cover','duration','fileSize','uploadedAt','createdAt','updatedAt'],
      };
      const previousData = current?.value ? JSON.parse(String(current.value)) : { books: [], photos: [], media: [] };
      const clean: Record<string, any[]> = {};
      for (const [kind, allowed] of Object.entries(definitions)) {
        const records = Array.isArray(body?.data?.[kind]) ? body.data[kind].slice(0, 2000) : [];
        clean[kind] = records.filter((item: any) => item && typeof item.id === 'string' && item.id.length <= 200 && !item.deleted)
          .map((item: any) => {
            const record: Record<string, unknown> = { ownerId: user.id, ownerUsername: user.username };
            for (const key of allowed) {
              const value = item[key];
              if (value === undefined) continue;
              if (typeof value === 'string' && /^(?:idb_file_|data:|blob:)/i.test(value)) continue;
              record[key] = value;
            }
            return record;
          });
      }
      const serialized = JSON.stringify(clean);
      if (new TextEncoder().encode(serialized).byteLength > 2 * 1024 * 1024) return Response.json({ success: false, error: '个人媒体目录超过 2 MiB；大文件请使用对象存储链接' }, { status: 413, headers });
      // Derive removals only from the authenticated user's persisted row; ignore client ownerId.
      // Legacy upload keys are globally shared, so only the dedicated per-user namespace is deletable.
      const extractManagedKey = (value: unknown): string | null => {
        if (typeof value !== 'string' || value.length > 2048) return null;
        let parsed: URL;
        try { parsed = new URL(value, url.origin); } catch { return null; }
        if (parsed.origin !== url.origin || parsed.search || parsed.hash) return null;
        const match = parsed.pathname.match(/^\/api\/files\/(.+)$/);
        if (!match) return null;
        let key = '';
        try { key = decodeURIComponent(match[1]); } catch { return null; }
        if (!/^user-media\/[A-Za-z0-9_-]{1,128}\/(?:[^/]{1,180})$/.test(key) || !key.startsWith(`user-media/${user.id}/`)) return null;
        return key;
      };
      const nextPhotoIds = new Set(clean.photos.map(item => item.id));
      const removedPhotos = (Array.isArray(previousData.photos) ? previousData.photos : []).filter((item: any) => item && typeof item.id === 'string' && !nextPhotoIds.has(item.id));
      const cleanupKeys = new Set<string>();
      for (const photo of removedPhotos) for (const value of [photo.url, photo.thumbnail]) {
        const key = extractManagedKey(value);
        if (key) cleanupKeys.add(key);
      }
      const bucket = env.R2_BUCKET || env.R2 || env.BUCKET;
      const external = getExternalObjectStoreConfig(env);
      const now = Date.now();
      const result = await env.DB.prepare(`INSERT INTO fox3_user_media (userId, value, revision, updatedAt)
        SELECT ?, ?, 1, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM fox3_user_media WHERE userId = ?)
        ON CONFLICT(userId) DO UPDATE SET value = excluded.value, revision = fox3_user_media.revision + 1, updatedAt = excluded.updatedAt
        WHERE fox3_user_media.revision = ?`).bind(user.id, serialized, now, expectedRevision, user.id, expectedRevision).run();
      if (!Number(result?.meta?.changes || 0)) {
        const latest = await env.DB.prepare('SELECT revision FROM fox3_user_media WHERE userId = ?').bind(user.id).first();
        return Response.json({ success: false, conflict: true, revision: Number(latest?.revision || 0), error: '个人文件已在其他设备更新，请刷新后重试' }, { status: 409, headers });
      }
      const cleanupFailures: string[] = [];
      for (const key of cleanupKeys) {
        let failed = false;
        if (bucket) try { await bucket.delete(key); } catch (error: any) {
          failed = true;
          console.warn('[User Media] R2 object cleanup failed:', String(error?.message || error).slice(0, 180));
        }
        if (external) try { await deleteExternalObject(external, key); } catch (error: any) {
          failed = true;
          console.warn('[User Media] external object cleanup failed:', String(error?.message || error).slice(0, 180));
        }
        // Remove any bounded fallback copy as well; older installs may have persisted the
        // same generated key in D1/KV or in the current isolate's memory cache.
        try { await env.DB.prepare('DELETE FROM fox3_files WHERE key = ?').bind(key).run(); } catch {}
        if (env.KV) try { await env.KV.delete(`fox3_file_${key}`); } catch (error: any) {
          failed = true;
          console.warn('[User Media] KV object cleanup failed:', String(error?.message || error).slice(0, 180));
        }
        const memoryFiles = (globalThis as any).__fox3_file_store;
        if (memoryFiles && Object.prototype.hasOwnProperty.call(memoryFiles, key)) delete memoryFiles[key];
        if (failed) cleanupFailures.push(key);
      }
      return Response.json({ success: true, revision: expectedRevision + 1, updatedAt: now, ...(cleanupFailures.length ? { cleanupPending: true, cleanupFailures: cleanupFailures.length, message: '照片目录已删除，但部分原文件或缩略图清理失败；该项目可能仍可访问，请联系管理员重试。' } : {}) }, { headers });
    } catch (error: any) {
      console.error('[User Media] D1 operation failed:', String(error?.message || error).slice(0, 180));
      return Response.json({ success: false, error: '个人媒体同步失败，请检查 D1（DB）绑定' }, { status: 503, headers });
    }
  }

  // Canonical, public site content is stored separately from private/admin sync data
  // and from WebDAV backup files. Public GET is read-only; writes require admin auth.
  if (path === '/admin/notebook') {
    if (!await hasAdminSession(request, env)) return Response.json({ success: false, error: '需要管理员会话' }, { status: 401, headers });
    if (!env.DB) return Response.json({ success: false, error: '需要绑定 D1 数据库 DB 才能跨设备保存记事本' }, { status: 503, headers });
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS fox3_admin_notebook (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updatedAt INTEGER NOT NULL)").run();
      if (request.method === 'GET') {
        const row = await env.DB.prepare("SELECT content FROM fox3_admin_notebook WHERE id = 'owner'").first();
        return Response.json({ success: true, content: String(row?.content || '') }, { headers });
      }
      if (request.method === 'PUT') {
        const input = await readJsonRequestLimited(request, 128 * 1024);
        const content = typeof input.content === 'string' ? input.content : '';
        if (new TextEncoder().encode(content).byteLength > 64 * 1024) return Response.json({ success: false, error: '记事本内容最多 64 KiB' }, { status: 413, headers });
        await env.DB.prepare("INSERT INTO fox3_admin_notebook (id, content, updatedAt) VALUES ('owner', ?, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content, updatedAt = excluded.updatedAt").bind(content, Date.now()).run();
        return Response.json({ success: true, updatedAt: Date.now() }, { headers });
      }
      if (request.method === 'DELETE') {
        await env.DB.prepare("DELETE FROM fox3_admin_notebook WHERE id = 'owner'").run();
        return Response.json({ success: true }, { headers });
      }
      return new Response('Method not allowed', { status: 405, headers });
    } catch (error: any) {
      return Response.json({ success: false, error: error?.message || '记事本数据库操作失败' }, { status: 500, headers });
    }
  }

  if (path === '/site-content') {
    if (!env.DB) {
      return Response.json({ success: false, error: '跨设备站点内容需要在 Cloudflare Pages Functions 绑定 D1（变量名 DB）' }, { status: 503, headers });
    }
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_site_content (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updatedAt INTEGER NOT NULL
      )`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_user_media (
        userId TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updatedAt INTEGER NOT NULL
      )`).run();
      const publicFields = ['posts', 'books', 'photos', 'photoFolders', 'media', 'products', 'websites', 'systemSettings', 'themeMode'];
      const publicSettings = ['siteName', 'headerTagline', 'shopCategories', 'themeColor', 'customPaletteBg', 'fullBackgroundUrl', 'avatarUrl', 'heroIntroImage', 'heroBadge', 'heroTitle', 'heroSubtitle', 'transparentCards', 'bottomButtonsEnabled', 'hideNonBlogForGuests', 'allowUserMediaManagement', 'allowPublicSitesAccess', 'globalTheme', 'deviceView', 'timezone', 'fontFamily', 'customFontName', 'customFontUrl', 'uploadedThemeName'];
      const cleanRecords = (value: unknown, kind: string): any[] => {
        if (!Array.isArray(value)) return [];
        const adminUsername = String(env.ADMIN_USERNAME || 'fox').trim().toLowerCase();
        return value.slice(0, 5000).filter((item: any) => {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length > 200 || item.deleted) return false;
          const isPublicOwner = item.ownerId ? item.ownerId === 'user_fox_admin' : !item.ownerUsername || String(item.ownerUsername).toLowerCase() === adminUsername;
          if (!isPublicOwner) return false;
          // Browser-only IndexedDB/data/blob URLs cannot be resolved from another device
          // and must never bloat the canonical D1 snapshot.
          const fileField = kind === 'books' ? 'fileUrl' : kind === 'photos' ? 'url' : kind === 'media' ? 'src' : '';
          const fileUrl = fileField ? item[fileField] : '';
          return !(typeof fileUrl === 'string' && /^(?:idb_file_|data:|blob:)/i.test(fileUrl));
        }).map((item: any) => {
          const allowed: Record<string, string[]> = {
            posts: ['id','title','summary','content','category','tags','cover','author','views','likes','createdAt','updatedAt'],
            books: ['id','title','author','format','cover','description','fileSize','fileUrl','displayFilename','createdAt','updatedAt'],
            photos: ['id','title','url','originalFilename','thumbnail','category','folderId','folderName','width','height','fileSize','description','createdAt','updatedAt'],
            photoFolders: ['id','name','createdAt'],
            media: ['id','type','title','artist','src','cover','duration','fileSize','uploadedAt','createdAt','updatedAt'],
            products: ['id','name','description','price','images','category','stock','tags','showcaseId','createdAt','updatedAt'],
            websites: ['id','title','url','poster','description','createdAt','updatedAt'],
          };
          const clean: Record<string, unknown> = {};
          for (const key of allowed[kind] || []) {
            if (item[key] === undefined) continue;
            if (typeof item[key] === 'string' && /^(?:idb_file_|data:|blob:)/i.test(item[key])) continue;
            if (key === 'images' && Array.isArray(item.images)) {
              clean.images = item.images.filter((url: unknown) => typeof url === 'string' && !/^(?:idb_file_|data:|blob:)/i.test(url));
              continue;
            }
            clean[key] = item[key];
          }
          return clean;
        });
      };
      const sanitize = (input: any) => {
        const source = input && typeof input === 'object' ? input : {};
        const result: Record<string, any> = {};
        for (const key of publicFields) {
          if (['posts','books','photos','photoFolders','media','products','websites'].includes(key)) result[key] = cleanRecords(source[key], key);
        }
        const settings = source.systemSettings && typeof source.systemSettings === 'object' ? source.systemSettings : {};
        result.systemSettings = Object.fromEntries(publicSettings.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
        if (['modern','win98','mac-classic','cyberpunk','nordic','leather','blueprint','retro','aurora-glass','neo-brutal','soft-pastel','editorial','pearl-mist','sage-atelier','terracotta','coastal-blue','velvet-plum'].includes(source.themeMode)) result.themeMode = source.themeMode;
        return result;
      };
      const publicUserMedia = async (data: Record<string, any>) => {
        const merged: Record<string, any[]> = { ...data, books: [...(data.books || [])], photos: [...(data.photos || [])], media: [...(data.media || [])] };
        const rows = await env.DB.prepare('SELECT value FROM fox3_user_media ORDER BY updatedAt DESC LIMIT 1000').all();
        for (const row of rows?.results || []) {
          try {
            const accountData = JSON.parse(String(row.value || '{}'));
            for (const kind of ['books', 'photos', 'media']) {
              if (!Array.isArray(accountData[kind])) continue;
              const ids = new Set(merged[kind].map((item: any) => item.id));
              for (const item of accountData[kind]) if (item?.id && !ids.has(item.id)) { merged[kind].push(item); ids.add(item.id); }
            }
          } catch {}
        }
        const stats = await env.DB.prepare('SELECT COALESCE(MAX(updatedAt), 0) AS updatedAt FROM fox3_user_media').first();
        const user = await getAuthenticatedUser(request, env);
        const ownRow = user ? await env.DB.prepare('SELECT revision FROM fox3_user_media WHERE userId = ?').bind(user.id).first() : null;
        return { data: merged, userMediaUpdatedAt: Number(stats?.updatedAt || 0), userMediaRevision: Number(ownRow?.revision || 0) };
      };
      const current = await env.DB.prepare('SELECT value, revision, updatedAt FROM fox3_site_content WHERE id = ?').bind('published').first();
      if (request.method === 'GET') {
        if (current?.value) {
          const userContent = await publicUserMedia(sanitize(JSON.parse(current.value)));
          return Response.json({ success: true, initialized: true, revision: Number(current.revision || 1), updatedAt: Number(current.updatedAt || 0), userMediaUpdatedAt: userContent.userMediaUpdatedAt, userMediaRevision: userContent.userMediaRevision, data: userContent.data }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
        }
        // One-time safe bootstrap from the legacy mixed snapshot; only public-whitelisted fields leave the server.
        let legacy: any = null;
        try {
          const old = await env.DB.prepare('SELECT value FROM fox3_sync WHERE key = ?').bind('global_state').first();
          if (old?.value) legacy = JSON.parse(old.value);
        } catch {}
        if (!legacy && env.KV) {
          try { const old = await env.KV.get('fox3_sync_global_state'); if (old) legacy = JSON.parse(old); } catch {}
        }
        const userContent = await publicUserMedia(sanitize(legacy || {}));
        return Response.json({ success: true, initialized: false, legacyAvailable: Boolean(legacy), revision: 0, updatedAt: 0, userMediaUpdatedAt: userContent.userMediaUpdatedAt, userMediaRevision: userContent.userMediaRevision, data: userContent.data }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'POST') {
        if (!await hasAdminSession(request, env)) return Response.json({ success: false, error: '发布站点内容需要管理员登录' }, { status: 401, headers });
        const length = Number(request.headers.get('content-length') || 0);
        if (length > 4 * 1024 * 1024) return Response.json({ success: false, error: '站点内容同步请求超过 4 MiB 限制' }, { status: 413, headers });
        let body: any;
        try { body = await readJsonRequestLimited(request, 4 * 1024 * 1024); }
        catch (error: any) {
          const tooLarge = error?.code === 'PAYLOAD_TOO_LARGE';
          return Response.json({ success: false, error: tooLarge ? '站点内容同步请求超过 4 MiB 限制' : '请求 JSON 格式无效' }, { status: tooLarge ? 413 : 400, headers });
        }
        const expectedRevision = Number(body?.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return Response.json({ success: false, error: '缺少有效的站点内容版本号，请先刷新' }, { status: 400, headers });
        const content = sanitize(body?.data);
        const serialized = JSON.stringify(content);
        if (new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024) return Response.json({ success: false, error: '站点内容超过 4 MiB；大文件请存入对象存储，仅同步文件链接和元数据' }, { status: 413, headers });
        if (current?.value && String(current.value) === serialized) return Response.json({ success: true, syncedToCloud: true, unchanged: true, revision: Number(current.revision || 1), updatedAt: Number(current.updatedAt || 0) }, { headers });
        const managedSiteKey = (value: unknown): string | null => {
          if (typeof value !== 'string' || value.length > 2048) return null;
          let parsed: URL;
          try { parsed = new URL(value, url.origin); } catch { return null; }
          if (parsed.origin !== url.origin || parsed.search || parsed.hash) return null;
          const match = parsed.pathname.match(/^\/api\/files\/([^/]+)$/);
          if (!match) return null;
          let key = '';
          try { key = decodeURIComponent(match[1]); } catch { return null; }
          // Only keys generated by the current upload API are eligible. Never infer ownership
          // for user-media namespaces or legacy/shared object names.
          if (key.includes('/') || !/^(?:[0-9]{10,13}-[0-9a-f-]{36}-[A-Za-z0-9._-]{1,150}|multipart-[1-9][0-9]*-[0-9]{10,13}-[0-9a-f-]{36}-[A-Za-z0-9._-]{1,150})$/i.test(key)) return null;
          return key;
        };
        const collectObjectKeys = (value: unknown, keys = new Set<string>()): Set<string> => {
          if (typeof value === 'string') { const key = managedSiteKey(value); if (key) keys.add(key); }
          else if (Array.isArray(value)) value.forEach(item => collectObjectKeys(item, keys));
          else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(item => collectObjectKeys(item, keys));
          return keys;
        };
        const oldPublic = current?.value ? sanitize(JSON.parse(String(current.value))) : {};
        const nextPhotoById = new Map((content.photos || []).map((photo: any) => [photo.id, photo]));
        const cleanupCandidates = new Set<string>();
        for (const oldPhoto of (oldPublic.photos || []) as any[]) {
          const nextPhoto: any = nextPhotoById.get(oldPhoto.id);
          for (const field of ['url', 'thumbnail']) {
            if (oldPhoto[field] && (!nextPhoto || nextPhoto[field] !== oldPhoto[field])) {
              const key = managedSiteKey(oldPhoto[field]);
              if (key) cleanupCandidates.add(key);
            }
          }
        }
        const result = await env.DB.prepare(`INSERT INTO fox3_site_content (id, value, revision, updatedAt)
          SELECT 'published', ?, 1, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM fox3_site_content WHERE id = 'published')
          ON CONFLICT(id) DO UPDATE SET value = excluded.value, revision = fox3_site_content.revision + 1, updatedAt = excluded.updatedAt
          WHERE fox3_site_content.revision = ?`).bind(serialized, Date.now(), expectedRevision, expectedRevision).run();
        if (!Number(result?.meta?.changes || 0)) {
          const latest = await env.DB.prepare('SELECT revision, updatedAt FROM fox3_site_content WHERE id = ?').bind('published').first();
          return Response.json({ success: false, conflict: true, revision: Number(latest?.revision || 0), error: '站点内容已在其他设备更新。请刷新后再编辑，避免覆盖新内容。' }, { status: 409, headers });
        }
        const saved = await env.DB.prepare('SELECT revision, updatedAt FROM fox3_site_content WHERE id = ?').bind('published').first();
        const referencedKeys = collectObjectKeys(content);
        try {
          const rows = await env.DB.prepare('SELECT value FROM fox3_user_media').all();
          for (const row of rows?.results || []) try { collectObjectKeys(JSON.parse(String(row.value || '{}')), referencedKeys); } catch {}
        } catch {}
        const remainingKeys = [...cleanupCandidates].filter(key => !referencedKeys.has(key));
        const cleanupFailures: string[] = [];
        const bucket = env.R2_BUCKET || env.R2 || env.BUCKET;
        const external = getExternalObjectStoreConfig(env);
        for (const key of remainingKeys) {
          let failed = false;
          if (bucket) try { await bucket.delete(key); } catch (error: any) { failed = true; console.warn('[Site Content] R2 photo cleanup failed:', String(error?.message || error).slice(0, 180)); }
          if (external) try { await deleteExternalObject(external, key); } catch (error: any) { failed = true; console.warn('[Site Content] external photo cleanup failed:', String(error?.message || error).slice(0, 180)); }
          try { await env.DB.prepare('DELETE FROM fox3_files WHERE key = ?').bind(key).run(); } catch (error: any) { if (!/no such table/i.test(String(error?.message || error))) failed = true; }
          if (env.KV) try { await env.KV.delete(`fox3_file_${key}`); } catch { failed = true; }
          const memoryFiles = (globalThis as any).__fox3_file_store;
          if (memoryFiles && Object.prototype.hasOwnProperty.call(memoryFiles, key)) delete memoryFiles[key];
          if (failed) cleanupFailures.push(key);
        }
        return Response.json({ success: true, syncedToCloud: true, revision: Number(saved?.revision || 1), updatedAt: Number(saved?.updatedAt || Date.now()), ...(cleanupFailures.length ? { cleanupPending: true, cleanupFailures: cleanupFailures.length, message: '相册记录已保存，但部分托管原图/缩略图清理失败；文件可能仍可访问，请联系管理员检查存储绑定。' } : {}) }, { headers });
      }
      return Response.json({ success: false, error: 'Method not allowed' }, { status: 405, headers });
    } catch (error: any) {
      console.error('[Site Content] Database operation failed:', String(error?.message || error).slice(0, 180));
      return Response.json({ success: false, error: '站点内容数据库操作失败；请检查 Pages 的 DB 绑定及数据库可用性' }, { status: 503, headers });
    }
  }

  // Cross-device sync store & retrieve (/api/sync/:key)
  // Devices push on explicit sync or opted-in data changes; this route is not polled in idle intervals.
  // Prefer D1 to avoid exhausting the daily KV write allowance; retain KV as fallback.
  if (path.startsWith('/sync/')) {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, error: '云端共享同步需要有效的管理员会话' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    const syncKey = path.replace('/sync/', '');

    // Initialize D1 table if DB is available
    if (env.DB) {
      try {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS fox3_sync (key TEXT PRIMARY KEY, value TEXT, updatedAt INTEGER)`
        ).run();
      } catch (e) {
        // Ignore table check errors
      }
    }

    if (request.method === 'GET') {
      let data: any = null;
      let fromCloud = false;

      // Check D1 first because it is the primary persistent store for sync data.
      if (env.DB) {
        try {
          const row = await env.DB.prepare(`SELECT value FROM fox3_sync WHERE key = ?`).bind(syncKey).first();
          if (row && row.value) {
            data = JSON.parse(row.value);
            fromCloud = true;
          }
        } catch (e) {}
      }

      // Read legacy KV data only when D1 has no value.
      if (!data && env.KV) {
        try {
          const val = await env.KV.get(`fox3_sync_${syncKey}`);
          if (val) {
            data = JSON.parse(val);
            fromCloud = true;
          }
        } catch (e) {}
      }


      if (data && typeof data === 'object') {
        for (const key of ['posts', 'books', 'photos', 'photoFolders', 'media', 'products', 'websites', 'themeMode', 'webDavBackups', 'webDavMeta', 'webDavConfig']) delete data[key];
        if (data.systemSettings && typeof data.systemSettings === 'object') {
          for (const key of ['siteName','headerTagline','shopCategories','themeColor','customPaletteBg','fullBackgroundUrl','avatarUrl','heroIntroImage','heroBadge','heroTitle','heroSubtitle','transparentCards','bottomButtonsEnabled','hideNonBlogForGuests','allowPublicSitesAccess','globalTheme','deviceView','timezone','fontFamily','customFontName','customFontUrl']) delete data.systemSettings[key];
        }
      }
      return new Response(JSON.stringify({
        success: true,
        data,
        fromCloud,
        timestamp: Date.now(),
      }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST') {
      try {
        const payload = await request.json();
        // Keep the legacy authenticated/private channel separate from canonical public site content and WebDAV.
        for (const key of ['posts', 'books', 'photos', 'photoFolders', 'media', 'products', 'websites', 'themeMode', 'webDavBackups', 'webDavMeta', 'webDavConfig']) delete payload[key];
        if (payload.systemSettings && typeof payload.systemSettings === 'object') {
          for (const key of ['siteName','headerTagline','shopCategories','themeColor','customPaletteBg','fullBackgroundUrl','avatarUrl','heroIntroImage','heroBadge','heroTitle','heroSubtitle','transparentCards','bottomButtonsEnabled','hideNonBlogForGuests','allowPublicSitesAccess','globalTheme','deviceView','timezone','fontFamily','customFontName','customFontUrl']) delete payload.systemSettings[key];
        }
        const stringified = JSON.stringify(payload);
        let syncedToCloud = false;


        if (env.DB) {
          try {
            await env.DB.prepare(
              `INSERT INTO fox3_sync (key, value, updatedAt) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
            ).bind(syncKey, stringified, Date.now()).run();
            syncedToCloud = true;
          } catch (e) {}
        }

        if (!syncedToCloud && env.KV) {
          try {
            await env.KV.put(`fox3_sync_${syncKey}`, stringified, { expirationTtl: 86400 * 90 });
            syncedToCloud = true;
          } catch (e) {}
        }

        if (!syncedToCloud) {
          return new Response(JSON.stringify({
            success: false,
            syncedToCloud: false,
            error: '未绑定可用的 D1 或 KV 持久化存储；为避免假成功，本次数据未确认保存到云端',
            timestamp: Date.now(),
          }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, syncedToCloud: true, timestamp: Date.now() }), {
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      } catch (syncErr: any) {
        return new Response(JSON.stringify({ success: false, syncedToCloud: false, error: syncErr?.message || '云端持久化同步失败' }), {
          status: 500,
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      }
    }
  }

  // Large uploads are split in the browser into small requests so Pages/Workers request-body
  // limits do not cap the complete file. R2 itself supports multipart objects up to 5 TiB.
  const uploadBucket = env.R2_BUCKET || env.R2 || env.BUCKET;
  const canAccessMultipartKey = async (key: string) => {
    const namespace = key.match(/^user-media\/([A-Za-z0-9_-]{1,128})\//);
    if (!namespace) return true; // Preserve the legacy, non-user-namespaced upload flow.
    const user = await getAuthenticatedUser(request, env);
    return Boolean((user && user.id === namespace[1]) || await hasAdminSession(request, env));
  };
  if (path === '/upload/multipart/create' && request.method === 'POST') {
    if (!uploadBucket) return Response.json({ success: false, error: '大文件分块上传需要绑定 R2_BUCKET 对象存储' }, { status: 503, headers });
    try {
      const input = await request.json() as { name?: string; type?: string; size?: number };
      const expectedSize = Number(input.size);
      const multipartChunkSize = 8 * 1024 * 1024;
      const maxProjectObjectBytes = multipartChunkSize * 10000;
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > maxProjectObjectBytes) return Response.json({ success: false, error: '文件大小无效或超过本项目当前 78.125 GiB 分块上传上限；R2 服务本身单对象上限为 5 TiB' }, { status: 413, headers });
      const name = String(input.name || 'upload.bin').slice(0, 240);
      if (/\.(html?|xhtml|svg|xml|js|mjs|cjs|wasm|php|phtml|exe|dll|bat|cmd|sh)$/i.test(name) || /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|application\/(javascript|ecmascript|wasm|x-msdownload)|text\/javascript)/i.test(String(input.type || ''))) return Response.json({ success: false, error: '不接受可执行网页、脚本或程序文件' }, { status: 415, headers });
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150) || 'upload.bin';
      const owner = await getAuthenticatedUser(request, env);
      const key = `${owner ? `user-media/${owner.id}/` : ''}multipart-${expectedSize}-${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const upload = await uploadBucket.createMultipartUpload(key, { httpMetadata: { contentType: String(input.type || 'application/octet-stream') }, customMetadata: { originalName: encodeURIComponent(name), expectedSize: String(expectedSize), uploadedAt: String(Date.now()) } });
      return Response.json({ success: true, key, uploadId: upload.uploadId, name, type: String(input.type || 'application/octet-stream') }, { headers });
    } catch (error: any) { return Response.json({ success: false, error: error?.message || '无法创建 R2 分块上传' }, { status: 500, headers }); }
  }
  if (path === '/upload/multipart/part' && request.method === 'PUT') {
    if (!uploadBucket) return Response.json({ success: false, error: 'R2_BUCKET 未绑定' }, { status: 503, headers });
    const key = url.searchParams.get('key') || '', uploadId = url.searchParams.get('uploadId') || '', partNumber = Number(url.searchParams.get('partNumber'));
    if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body) return Response.json({ success: false, error: '分块参数缺失或无效' }, { status: 400, headers });
    if (!await canAccessMultipartKey(key)) return Response.json({ success: false, error: '无权操作其他用户的分块文件' }, { status: 403, headers });
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 8 * 1024 * 1024) return Response.json({ success: false, error: '单个分块不能超过 8 MiB' }, { status: 413, headers });
    try { const part = await uploadBucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, request.body); return Response.json({ success: true, part }, { headers }); }
    catch (error: any) { return Response.json({ success: false, error: error?.message || '分块上传失败' }, { status: 502, headers }); }
  }
  if (path === '/upload/multipart/abort' && request.method === 'POST') {
    if (!uploadBucket) return Response.json({ success: false, error: 'R2_BUCKET 未绑定' }, { status: 503, headers });
    try { const input = await request.json() as { key?: string; uploadId?: string }; if (!input.key || !input.uploadId) return Response.json({ success: false, error: '缺少 key 或 uploadId' }, { status: 400, headers }); if (!await canAccessMultipartKey(input.key)) return Response.json({ success: false, error: '无权操作其他用户的分块文件' }, { status: 403, headers }); await uploadBucket.resumeMultipartUpload(input.key, input.uploadId).abort(); return Response.json({ success: true }, { headers }); }
    catch (error: any) { return Response.json({ success: false, error: error?.message || '无法取消分块上传' }, { status: 502, headers }); }
  }
  if (path === '/upload/multipart/complete' && request.method === 'POST') {
    if (!uploadBucket) return Response.json({ success: false, error: 'R2_BUCKET 未绑定' }, { status: 503, headers });
    try {
      const input = await request.json() as { key?: string; uploadId?: string; parts?: any[]; name?: string; type?: string; size?: number };
      if (!input.key || !input.uploadId || !Array.isArray(input.parts) || !input.parts.length || input.parts.length > 10000) return Response.json({ success: false, error: '分块完成参数无效' }, { status: 400, headers });
      if (!await canAccessMultipartKey(input.key)) return Response.json({ success: false, error: '无权完成其他用户的分块文件' }, { status: 403, headers });
      const sizeMatch = /^(?:user-media\/[A-Za-z0-9_-]{1,128}\/)?multipart-([1-9][0-9]*)-[0-9]+-[0-9a-f-]+-[a-zA-Z0-9._-]+$/.exec(input.key);
      if (!sizeMatch) return Response.json({ success: false, error: '分块对象键无效' }, { status: 400, headers });
      const multipart = uploadBucket.resumeMultipartUpload(input.key, input.uploadId);
      const expectedSize = Number(sizeMatch[1]);
      const expectedParts = Math.ceil(expectedSize / (8 * 1024 * 1024));
      const parts = input.parts as Array<{ partNumber: number; etag: string }>;
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || parts.length !== expectedParts || parts.some((part, index) => part.partNumber !== index + 1 || typeof part.etag !== 'string' || !part.etag)) return Response.json({ success: false, error: '分块清单与初始化时声明的文件大小不一致' }, { status: 400, headers });
      const completed = await multipart.complete(parts);
      if (Number(completed.size) !== expectedSize) return Response.json({ success: false, error: 'R2 完成后的对象大小与文件声明不一致' }, { status: 502, headers });
      return Response.json({ success: true, key: input.key, url: `/api/files/${encodeURIComponent(input.key)}`, name: String(input.name || 'upload.bin'), size: completed.size, storedTarget: 'r2', type: String(input.type || 'application/octet-stream') }, { headers });
    } catch (error: any) { return Response.json({ success: false, error: error?.message || '无法完成 R2 分块上传' }, { status: 502, headers }); }
  }

  // Public file uploads support blog/media publishing; apply strict size and active-content limits.
  if (path === '/upload' && request.method === 'POST') {
    try {
      const maxUploadBytes = 95 * 1024 * 1024; // One-request fallback only; larger files use the multipart R2 endpoints above.
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > maxUploadBytes + 1024 * 1024) return Response.json({ success: false, error: '单次请求过大；大文件请使用 R2 分块上传并绑定 R2_BUCKET' }, { status: 413, headers });
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return new Response(JSON.stringify({ error: 'No file uploaded' }), {
          status: 400,
          headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
        });
      }
      if (file.size > maxUploadBytes) return Response.json({ success: false, error: '该文件需通过 R2 分块上传；请检查前端版本及 R2_BUCKET 绑定' }, { status: 413, headers });
      if (/\.(html?|xhtml|svg|xml|js|mjs|cjs|wasm|php|phtml|exe|dll|bat|cmd|sh)$/i.test(file.name) || /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|application\/(javascript|ecmascript|wasm|x-msdownload)|text\/javascript)/i.test(file.type)) {
        return new Response(JSON.stringify({ success: false, error: '不接受可执行网页、脚本或程序文件' }), { status: 415, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const canUseD1Fallback = file.size <= 1024 * 1024 && Boolean(env.DB);
      const canUseKvFallback = file.size <= 18 * 1024 * 1024 && Boolean(env.KV);
      const canUseMemoryFallback = file.size <= 4 * 1024 * 1024;
      const externalObjectStore = getExternalObjectStoreConfig(env);
      if (!env.R2_BUCKET && !externalObjectStore && !canUseD1Fallback && !canUseKvFallback && !canUseMemoryFallback) {
        return new Response(JSON.stringify({ success: false, error: '该文件大小需绑定 Cloudflare R2 或配置服务端 COS/OSS/S3-compatible 存储；D1/KV/内存回退无法安全保存此文件' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150) || 'upload.bin';
      const owner = await getAuthenticatedUser(request, env);
      const key = `${owner ? `user-media/${owner.id}/` : ''}${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;
      const contentType = file.type || 'application/octet-stream';
      let storedTarget = 'none';

      // 1. Primary: Cloudflare R2 Storage
      if (env.R2_BUCKET) {
        try {
          await env.R2_BUCKET.put(key, file.stream(), {
            httpMetadata: {
              contentType,
              contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
            },
            customMetadata: {
              originalName: encodeURIComponent(file.name),
              uploadedAt: String(Date.now()),
            }
          });
          storedTarget = 'r2';
        } catch (r2Err) {
          console.warn('[fox3] R2 upload error; trying configured external object storage or bounded fallback:', r2Err);
        }
      }

      // 2. Secondary object storage: Tencent COS / Alibaba OSS via server-side credentials.
      if (storedTarget === 'none' && externalObjectStore) {
        try {
          await putExternalObject(externalObjectStore, key, file.stream(), contentType, file.name);
          storedTarget = externalObjectStore.provider;
        } catch (externalErr) {
          console.warn(`[fox3] ${externalObjectStore.provider.toUpperCase()} upload failed; trying bounded fallback:`, externalErr);
        }
      }

      // Convert file buffer to base64 if needed for D1/KV/Memory
      let base64Data = '';
      if (storedTarget === 'none' && (canUseD1Fallback || canUseKvFallback || canUseMemoryFallback)) {
        const arrayBuf = await file.arrayBuffer();
        base64Data = uint8ArrayToBase64(new Uint8Array(arrayBuf));
      }

      // 3. Cloudflare D1 SQLite database (fox3_files table), limited to 1 MiB.
      if (storedTarget === 'none' && canUseD1Fallback) {
        try {
          await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS fox3_files (
              key TEXT PRIMARY KEY,
              name TEXT,
              type TEXT,
              size INTEGER,
              data TEXT,
              uploadedAt INTEGER
            )`
          ).run();

          await env.DB.prepare(
            `INSERT INTO fox3_files (key, name, type, size, data, uploadedAt)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(key, file.name, contentType, file.size, base64Data, Date.now()).run();
          storedTarget = 'd1';
        } catch (d1Err) {
          console.warn('[fox3] D1 file store failed:', d1Err);
        }
      }

      // 4. Cloudflare KV, limited to 18 MiB.
      if (storedTarget === 'none' && canUseKvFallback) {
        try {
          await env.KV.put(`fox3_file_${key}`, JSON.stringify({
            name: file.name,
            type: contentType,
            size: file.size,
            data: base64Data,
            uploadedAt: Date.now()
          }), { expirationTtl: 86400 * 90 });
          storedTarget = 'kv';
        } catch (kvErr) {
          console.warn('[fox3] KV file store failed:', kvErr);
        }
      }

      // 5. In-Memory Edge Cache Fallback, limited to 4 MiB and not durable.
      if (storedTarget === 'none' && canUseMemoryFallback) {
        if (!(globalThis as any).__fox3_file_store) {
          (globalThis as any).__fox3_file_store = {};
        }
        (globalThis as any).__fox3_file_store[key] = {
          name: file.name,
          type: contentType,
          size: file.size,
          data: base64Data,
          uploadedAt: Date.now()
        };
        storedTarget = 'memory';
      }

      if (storedTarget === 'none') {
        return new Response(JSON.stringify({ success: false, error: '文件未保存：请检查 R2 绑定；若配置 COS/OSS/S3-compatible，请核对 provider、Bucket、地域、endpoint、访问密钥与写入权限；小文件还可检查 D1/KV 绑定和可用额度。' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const publicUrl = `/api/files/${key}`;
      return new Response(JSON.stringify({
        success: true,
        key,
        url: publicUrl,
        name: file.name,
        size: file.size,
        type: contentType,
        storedTarget,
      }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), {
        status: 500,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
      });
    }
  }

  if ((path === '/storage/usage' || path === '/storage/files') && request.method === 'GET') {
    if (!await hasAdminSession(request, env)) return Response.json({ success: false, error: '仅管理员可查看存储用量与文件' }, { status: 401, headers });
    const bucket = env.R2_BUCKET || env.R2 || env.BUCKET;
    try {
      if (!bucket) {
        let d1FallbackBytes = 0, d1FallbackFiles = 0;
        if (env.DB) try {
          const totals = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS files FROM fox3_files').first();
          d1FallbackBytes = Number(totals?.bytes || 0); d1FallbackFiles = Number(totals?.files || 0);
        } catch {}
        if (path === '/storage/files') {
          if (!env.DB) return Response.json({ success: false, error: '未绑定 R2 Bucket，也没有 D1 可列举回退文件' }, { status: 503, headers });
          let rows: any[] = [];
          try { const result = await env.DB.prepare('SELECT key,name,size,type,uploadedAt FROM fox3_files ORDER BY uploadedAt DESC LIMIT 500').all(); rows = result?.results || []; } catch {}
          const objects = rows.map((row: any) => ({ key: String(row.key), name: String(row.name || row.key), size: Number(row.size || 0), uploadedAt: Number(row.uploadedAt || 0), contentType: String(row.type || 'application/octet-stream'), url: `/api/files/${encodeURIComponent(String(row.key))}` }));
          return Response.json({ success: true, objects, truncated: false, cursor: null }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
        }
        return Response.json({ success: true, provider: 'none', r2Bytes: 0, r2Files: 0, d1FallbackBytes, d1FallbackFiles, exact: true,
          note: '未绑定 R2；统计显示 D1 中的回退文件字节。外部 COS/OSS/S3 与浏览器临时文件不包含在此统计。' }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
      }
      if (path === '/storage/files') {
        const cursor = url.searchParams.get('cursor') || undefined;
        const result = await bucket.list({ limit: 100, ...(cursor ? { cursor } : {}) });
        const objects = (result.objects || []).map((object: any) => {
          const encoded = object.customMetadata?.originalName;
          let originalName = String(encoded || object.key);
          try { originalName = decodeURIComponent(originalName); } catch {}
          return { key: String(object.key), name: originalName, size: Number(object.size || 0), uploadedAt: object.uploaded?.getTime?.() || null,
            contentType: String(object.httpMetadata?.contentType || 'application/octet-stream'), url: `/api/files/${encodeURIComponent(String(object.key))}` };
        });
        return Response.json({ success: true, objects, truncated: Boolean(result.truncated), cursor: result.truncated ? result.cursor : null }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
      }
      let bytes = 0, objects = 0, pages = 0, cursor: string | undefined;
      do {
        const result = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const object of result.objects || []) { bytes += Number(object.size || 0); objects++; }
        pages++;
        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor && pages < 100);
      let d1FallbackBytes = 0, d1FallbackFiles = 0;
      if (env.DB) try {
        const totals = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS files FROM fox3_files').first();
        d1FallbackBytes = Number(totals?.bytes || 0); d1FallbackFiles = Number(totals?.files || 0);
      } catch { /* D1 fallback table may not exist on this deployment. */ }
      return Response.json({ success: true, provider: 'R2', r2Bytes: bytes, r2Files: objects, d1FallbackBytes, d1FallbackFiles,
        exact: !cursor, note: cursor ? '对象总量超过本次统计页数上限，当前结果为部分统计。' : 'R2 字节来自 Bucket 全量对象枚举；D1 回退文件单独计数，不与 R2 重复相加。' }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
    } catch (error: any) {
      console.error('[Storage] bucket listing failed:', String(error?.message || error).slice(0, 240));
      return Response.json({ success: false, error: '无法枚举 R2 Bucket；请检查 R2 绑定权限与可用性。' }, { status: 503, headers });
    }
  }

  // Universal file stream from R2, configured external object storage, D1, KV, or memory.
  if (path.startsWith('/files/')) {
    let key = path.replace('/files/', '');
    try { key = decodeURIComponent(key); } catch {}
    const isDownload = url.searchParams.get('download') === '1';

    if (request.method === 'DELETE') {
      if (!await hasAdminSession(request, env)) return Response.json({ success: false, error: '仅管理员可删除本站文件' }, { status: 401, headers });
      let removed = false;
      const bucket = env.R2_BUCKET || env.R2 || env.BUCKET;
      if (bucket) try { await bucket.delete(key); removed = true; } catch (error: any) {
        console.warn('[Storage] R2 object delete failed:', String(error?.message || error).slice(0, 180));
        return Response.json({ success: false, error: 'R2 文件删除失败；未清理媒体目录' }, { status: 502, headers });
      }
      const external = getExternalObjectStoreConfig(env);
      if (external) try { await deleteExternalObject(external, key); removed = true; } catch (error: any) {
        console.warn('[Storage] external object delete failed:', String(error?.message || error).slice(0, 180));
        return Response.json({ success: false, error: `${external.provider.toUpperCase()} 文件删除失败；请检查对象存储删除权限` }, { status: 502, headers });
      }
      if (env.DB) {
        try { await env.DB.prepare('DELETE FROM fox3_files WHERE key = ?').bind(key).run(); removed = true; } catch {}
        const pathRef = `/api/files/${encodeURIComponent(key)}`;
        try {
          const published = await env.DB.prepare('SELECT value FROM fox3_site_content WHERE id = ?').bind('published').first();
          if (published?.value) {
            const data = JSON.parse(String(published.value));
            const clear = (value: any) => typeof value === 'string' ? value.split(pathRef).join('') : value;
            for (const post of data.posts || []) { if (post.cover === pathRef) post.cover = ''; if (typeof post.content === 'string') post.content = clear(post.content); }
            for (const book of data.books || []) { if (book.fileUrl === pathRef) book.fileUrl = ''; if (book.cover === pathRef) book.cover = ''; }
            data.photos = (data.photos || []).filter((item: any) => item.url !== pathRef);
            data.media = (data.media || []).filter((item: any) => item.src !== pathRef);
            for (const product of data.products || []) product.images = (product.images || []).filter((image: string) => image !== pathRef);
            for (const site of data.websites || []) if (site.poster === pathRef) site.poster = '';
            await env.DB.prepare('UPDATE fox3_site_content SET value = ?, revision = revision + 1, updatedAt = ? WHERE id = ?').bind(JSON.stringify(data), Date.now(), 'published').run();
          }
          const users = await env.DB.prepare('SELECT userId, value FROM fox3_user_media').all();
          for (const row of users?.results || []) {
            try {
              const data = JSON.parse(String(row.value || '{}'));
              data.books = (data.books || []).filter((item: any) => item.fileUrl !== pathRef);
              data.photos = (data.photos || []).filter((item: any) => item.url !== pathRef);
              data.media = (data.media || []).filter((item: any) => item.src !== pathRef);
              await env.DB.prepare('UPDATE fox3_user_media SET value = ?, revision = revision + 1, updatedAt = ? WHERE userId = ?').bind(JSON.stringify(data), Date.now(), row.userId).run();
            } catch {}
          }
        } catch (error: any) {
          console.warn('[Storage] metadata cleanup failed:', String(error?.message || error).slice(0, 180));
        }
      }
      const kv = env.KV || env.FOX3_KV;
      if (kv) try { await kv.delete(`fox3_file_${key}`); removed = true; } catch {}
      const memory = (globalThis as any).__fox3_file_store;
      if (memory?.[key]) { delete memory[key]; removed = true; }
      return Response.json({ success: true, removed, key, message: '文件已从可用存储中删除，并清理了站点媒体目录中的引用。' }, { headers: { ...Object.fromEntries(headers.entries()), 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers });

    // 1. Try fetch from R2
    const readBucket = env.R2_BUCKET || env.R2 || env.BUCKET;
    if (readBucket) {
      try {
        const object = await readBucket.get(key);
        if (object) {
          const responseHeaders = new Headers(headers);
          applyFileSafetyHeaders(responseHeaders);
          object.writeHttpMetadata(responseHeaders);
          responseHeaders.set('etag', object.httpEtag);
          responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');

          if (isDownload) {
            const originalName = object.customMetadata?.originalName || key;
            responseHeaders.set('Content-Disposition', `attachment; filename="${originalName}"; filename*=UTF-8''${originalName}`);
          }
          return new Response(object.body, { headers: responseHeaders });
        }
      } catch (e) {}
    }

    // 2. Read from the configured COS/OSS object provider when available.
    const externalObjectStore = getExternalObjectStoreConfig(env);
    if (externalObjectStore) {
      try {
        const object = await getExternalObject(externalObjectStore, key);
        if (object) {
          const responseHeaders = new Headers(headers);
          applyFileSafetyHeaders(responseHeaders);
          responseHeaders.set('Content-Type', object.headers.get('content-type') || 'application/octet-stream');
          responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          const originalName = object.headers.get('x-amz-meta-original-name') || object.headers.get('x-oss-meta-original-name') || key;
          if (isDownload) {
            const asciiName = key.split('-').slice(2).join('-') || 'download';
            responseHeaders.set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${originalName}`);
          }
          return new Response(object.body, { headers: responseHeaders });
        }
      } catch (e) {
        console.warn(`[fox3] ${externalObjectStore.provider.toUpperCase()} read failed; trying bounded fallback:`, e);
      }
    }

    // 3. Try fetch from D1
    if (env.DB) {
      try {
        const row = await env.DB.prepare(
          `SELECT name, type, size, data FROM fox3_files WHERE key = ?`
        ).bind(key).first();

        if (row && row.data) {
          const binaryStr = atob(row.data);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const responseHeaders = new Headers(headers);
          applyFileSafetyHeaders(responseHeaders);
          responseHeaders.set('Content-Type', row.type || 'application/octet-stream');
          responseHeaders.set('Content-Length', String(len));
          responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          if (isDownload) {
            const safeName = encodeURIComponent(row.name || key);
            responseHeaders.set('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${safeName}`);
          }
          return new Response(bytes.buffer, { headers: responseHeaders });
        }
      } catch (e) {}
    }

    // 3. Try fetch from KV
    if (env.KV) {
      try {
        const kvVal = await env.KV.get(`fox3_file_${key}`);
        if (kvVal) {
          const fileMeta = JSON.parse(kvVal);
          if (fileMeta && fileMeta.data) {
            const binaryStr = atob(fileMeta.data);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const responseHeaders = new Headers(headers);
            applyFileSafetyHeaders(responseHeaders);
            responseHeaders.set('Content-Type', fileMeta.type || 'application/octet-stream');
            responseHeaders.set('Content-Length', String(len));
            responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
            if (isDownload) {
              const safeName = encodeURIComponent(fileMeta.name || key);
              responseHeaders.set('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${safeName}`);
            }
            return new Response(bytes.buffer, { headers: responseHeaders });
          }
        }
      } catch (e) {}
    }

    // 4. Try fetch from in-memory store
    if ((globalThis as any).__fox3_file_store && (globalThis as any).__fox3_file_store[key]) {
      const fileMeta = (globalThis as any).__fox3_file_store[key];
      const binaryStr = atob(fileMeta.data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const responseHeaders = new Headers(headers);
      applyFileSafetyHeaders(responseHeaders);
      responseHeaders.set('Content-Type', fileMeta.type || 'application/octet-stream');
      responseHeaders.set('Content-Length', String(len));
      responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (isDownload) {
        const safeName = encodeURIComponent(fileMeta.name || key);
        responseHeaders.set('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${safeName}`);
      }
      return new Response(bytes.buffer, { headers: responseHeaders });
    }

    return new Response('File not found', { status: 404, headers });
  }

  // D1 Database status & health indicator (secure - no raw SQL execution)
  if (path === '/d1/status' && request.method === 'GET') {
    return new Response(JSON.stringify({
      available: Boolean(env.DB),
      type: 'Cloudflare D1 SQLite',
      time: new Date().toISOString()
    }), {
      headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
    });
  }

  if (path === '/mail/inbox' && request.method === 'GET') {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, error: '查看站内收件箱需要管理员重新登录' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '站内收件箱需要绑定 D1 数据库 DB' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_inbound_emails (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]',
        receivedAt INTEGER NOT NULL
      )`).run();
      const result = await env.DB.prepare('SELECT id, eventId, sender, recipient, subject, body, receivedAt FROM fox3_inbound_emails ORDER BY receivedAt DESC LIMIT 200').all();
      const mails = (result?.results || []).map((row: any) => {
        const isImap = String(row.eventId || '').startsWith('imap:');
        return {
          id: `${isImap ? 'imap' : 'resend'}-inbound-${row.id}`,
          folder: 'inbox',
          sender: String(row.sender || ''),
          recipient: String(row.recipient || ''),
          subject: String(row.subject || '(无主题)'),
          body: String(row.body || ''),
          date: new Date(Number(row.receivedAt) || Date.now()).toISOString().replace('T', ' ').slice(0, 19),
          read: false,
          isStarred: false,
          createdAt: Number(row.receivedAt) || Date.now(),
          updatedAt: Number(row.receivedAt) || Date.now(),
        };
      });
      return new Response(JSON.stringify({ success: true, mails }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ success: false, error: '读取 D1 收件箱失败，请检查数据库绑定与迁移状态' }), { status: 500, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  if (path === '/mail/imap-test' && request.method === 'POST') {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, error: 'IMAP 连接测试需要管理员登录' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    try {
      const body = await request.json().catch(() => ({})) as any;
      const source = body.source === 'backend' ? 'backend' : 'frontend';
      const settings = source === 'backend' ? getImapSettings({}, env) : getImapSettings(body.imapConfig || {}, {});
      const probe = await testImapConnection(settings);
      return new Response(JSON.stringify({ success: true, source, ...probe, mailbox: 'INBOX' }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err?.message || 'IMAP 连接测试失败' }), {
        status: 502,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/mail/imap-sync' && request.method === 'POST') {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, error: '拉取 IMAP 收件箱需要管理员登录' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: '需要绑定数据库 DB 才能保存收件箱邮件' }), { status: 503, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    try {
      const body = await request.json().catch(() => ({})) as any;
      const source = body.source === 'backend' ? 'backend' : 'frontend';
      const settings = source === 'backend' ? getImapSettings({}, env) : getImapSettings(body.imapConfig || {}, {});
      const { exists, messages } = await fetchImapMessages(settings, Number(body.limit || 25));

      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_inbound_emails (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        attachments TEXT NOT NULL DEFAULT '[]',
        receivedAt INTEGER NOT NULL
      )`).run();

      let imported = 0;
      for (const msg of messages) {
        const eventId = `imap:${settings.host.toLowerCase()}:${settings.user.toLowerCase()}:${msg.uid || msg.messageId}`;
        const insertRes = await env.DB.prepare(
          `INSERT OR IGNORE INTO fox3_inbound_emails (id, eventId, sender, recipient, subject, body, attachments, receivedAt)
           VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`
        ).bind(
          crypto.randomUUID(),
          eventId.slice(0, 240),
          msg.sender,
          msg.recipient || settings.user,
          msg.subject,
          msg.body,
          msg.receivedAt,
        ).run();
        imported += Number(insertRes?.meta?.changes || 0);
      }

      await env.DB.prepare(
        `DELETE FROM fox3_inbound_emails WHERE id NOT IN (SELECT id FROM fox3_inbound_emails ORDER BY receivedAt DESC LIMIT 500)`
      ).run();

      return new Response(JSON.stringify({
        success: true,
        source,
        exists,
        totalFetched: messages.length,
        imported,
        host: settings.host,
      }), {
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err?.message || 'IMAP 同步收件箱失败' }), {
        status: 502,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/mail/test-connection' && request.method === 'POST') {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, error: '连接测试需要管理员重新登录' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    try {
      const probe = await probeResendConnection(getOutboundSettings({}, env));
      return new Response(JSON.stringify({ success: true, ...probe }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err?.message || 'Resend API 连接检查失败' }), { status: 502, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  // Send an email through the selected SMTP/API provider; never claim success on local-only fallback.
  if (path === '/mail/test' && request.method === 'POST') {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, error: '邮件连通测试需要管理员重新登录' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    try {
      if (env.DB) {
        try {
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fox3_mail_test_rates (ipHash TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL)`).run();
          const ipHash = await hashRateLimitIp(request.headers.get('CF-Connecting-IP') || 'unknown');
          const now = Date.now();
          await env.DB.prepare('DELETE FROM fox3_mail_test_rates WHERE ipHash = ? AND expiresAt <= ?').bind(ipHash, now).run();
          const reservation = await env.DB.prepare('INSERT OR IGNORE INTO fox3_mail_test_rates (ipHash, expiresAt) VALUES (?, ?)').bind(ipHash, now + 60_000).run();
          if (Number(reservation?.meta?.changes || 0) === 0) {
            return new Response(JSON.stringify({ success: false, error: '测试邮件每分钟仅允许一次，请稍后再试' }), { status: 429, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
          }
        } catch (rateLimitError: any) {
          console.warn(`[Mail Backend] D1 rate limit unavailable; admin-only test continues: ${String(rateLimitError?.message || rateLimitError).slice(0, 120)}`);
        }
      }
      const body = await request.json() as any;
      const source = body.source === 'backend' ? 'backend' : 'frontend';
      const settings = source === 'backend'
        ? getOutboundSettings({}, env)
        : getOutboundSettings(body.clientEmailSettings || {}, {});
      const to = normalizeEmail(settings.senderEmail || '');
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to)) {
        return new Response(JSON.stringify({ success: false, source, error: source === 'backend' ? '后台 MAIL_SENDER 未配置为有效邮箱地址' : '前台发件人邮箱不是有效地址' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }
      const result = await dispatchEmail(settings, {
        to,
        subject: 'fox3 邮件连通测试',
        text: `这是一封 fox3 ${source === 'backend' ? '后台环境变量' : '前台邮箱配置'}的连通测试邮件。收到本邮件说明邮件服务已接受投递请求。`,
        html: `<p>这是一封 fox3 ${source === 'backend' ? '后台环境变量' : '前台邮箱配置'}的连通测试邮件。</p><p>收到本邮件说明邮件服务已接受投递请求。</p>`,
      });
      return new Response(JSON.stringify({ success: result.success, source, provider: result.provider, recipient: to, error: result.error || undefined }), {
        status: result.success ? 200 : 502,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err?.message || '邮件连通测试失败' }), { status: 500, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  if (path === '/mail/send' && request.method === 'POST') {
    if (!await hasAdminSession(request, env)) {
      return new Response(JSON.stringify({ success: false, delivered: false, error: '发送邮件需要有效的管理员会话，请重新登录' }), { status: 401, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
    try {
      const body = await request.json() as any;
      const { subject, html, text, type, clientEmailSettings } = body;
      let to = normalizeEmail(body.to);
      if (type === 'admin_reply' && body.recipientIdentity) {
        const registeredEmail = await findRegisteredUserEmail(env.DB, String(body.recipientIdentity));
        if (registeredEmail) to = registeredEmail;
      }
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to)) {
        return new Response(JSON.stringify({ success: false, error: '收件人必须是有效邮箱地址' }), { status: 400, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const settings = body.settingsSource === 'backend'
        ? getOutboundSettings({}, env)
        : getOutboundSettings(clientEmailSettings || {}, {});
      const mailSubject = String(subject || 'fox3 博客系统通知').replace(/[\r\n]+/g, ' ').slice(0, 180);
      const mailText = typeof text === 'string' ? text.slice(0, 100000) : '';
      const mailHtml = typeof html === 'string' ? html.slice(0, 150000) : undefined;
      const result = await dispatchEmail(settings, { to, subject: mailSubject, text: mailText, html: mailHtml });
      if (!result.success) {
        return new Response(JSON.stringify({ success: false, delivered: false, externalDispatched: false, provider: result.provider, error: result.error || '邮件发送失败' }), { status: 502, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
      }

      const mailRecord = {
        id: `mail_dispatch_${Date.now()}`,
        folder: 'sent',
        recipient: to,
        sender: settings.senderEmail || env.MAIL_SENDER || '',
        subject: mailSubject,
        body: mailText || mailHtml || '',
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        delivered: true,
        externalDispatched: true,
        externalProvider: result.provider,
        read: true,
        isStarred: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return new Response(JSON.stringify({
        success: true,
        delivered: true,
        externalDispatched: true,
        provider: result.provider,
        mailRecord,
        message: `已通过 ${result.provider} 成功投递至 ${to}`,
      }), { headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, delivered: false, error: err?.message || '邮件发送失败' }), { status: 500, headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' } });
    }
  }

  // Mail Service API Status & Configuration Endpoint
  // Reads backend Cloudflare environment variables or D1/KV storage
  if (path === '/mail/status') {
    const outboundSettings = getOutboundSettings({}, env);
    const outboundConfigured = outboundSettings.provider === 'smtp'
      ? Boolean(outboundSettings.smtpHost && outboundSettings.smtpUser && outboundSettings.smtpPass && outboundSettings.senderEmail)
      : Boolean(outboundSettings.apiKey && outboundSettings.senderEmail && (outboundSettings.provider !== 'sendcloud' || outboundSettings.apiUser));
    const outboundApiKeyConfigured = outboundSettings.provider !== 'smtp' && Boolean(outboundSettings.apiKey);
    const inboundApiKeyAvailable = Boolean(env.RESEND_API_KEY);
    const resendInboundReady = Boolean(env.DB && env.RESEND_WEBHOOK_SECRET && inboundApiKeyAvailable);
    const imapSettings = getImapSettings({}, env);
    const imapConfigured = Boolean(imapSettings.host && imapSettings.user && imapSettings.pass);
    const inboundServerReady = resendInboundReady || Boolean(env.DB && imapConfigured);
    let lastReceivedAt: number | null = null;
    if (env.DB) {
      try {
        const lastReceived = await env.DB.prepare('SELECT MAX(receivedAt) AS lastReceivedAt FROM fox3_inbound_emails').first();
        const value = Number(lastReceived?.lastReceivedAt);
        if (Number.isFinite(value) && value > 0) lastReceivedAt = value;
      } catch {}
    }

    return new Response(JSON.stringify({
      success: true,
      outbound: {
        configured: outboundConfigured,
        apiKeyConfigured: outboundApiKeyConfigured,
        apiUserConfigured: outboundSettings.provider === 'sendcloud' && Boolean(outboundSettings.apiUser),
        senderConfigured: Boolean(outboundSettings.senderEmail),
        provider: outboundSettings.provider,
        smtpHost: outboundSettings.smtpHost || '',
        connectionProbeSupported: outboundSettings.provider === 'resend',
        verified: false,
        status: outboundConfigured ? 'configured_unverified' : 'unconfigured',
        senderEmail: outboundSettings.senderEmail || '',
      },
      inbound: {
        configured: inboundServerReady,
        resendConfigured: resendInboundReady,
        imapConfigured,
        imapHost: imapSettings.host || '',
        implemented: true,
        verified: Boolean(lastReceivedAt),
        d1Available: Boolean(env.DB),
        webhookSecretConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
        resendApiKeyConfigured: inboundApiKeyAvailable,
        lastReceivedAt,
        status: lastReceivedAt ? 'receiving' : inboundServerReady ? 'server_ready_waiting_for_first_email' : 'missing_server_configuration',
      },
      quotaLimit: 3000,
      timestamp: Date.now(),
    }), {
      headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ message: 'fox3 Cloudflare API Ready' }), {
    headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' }
  });
};
