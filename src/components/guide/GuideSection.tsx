import React, { useState } from 'react';
import {
  HelpCircle,
  Cloud,
  Database,
  HardDrive,
  Server,
  Upload,
  CheckCircle,
  Copy,
  ChevronRight,
  ExternalLink,
  Layers,
  Key,
  Mail,
  QrCode,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { translateInline } from '../../utils/i18n';

export const GuideSection: React.FC = () => {
  const { locale } = useApp();
  const tx = (source: string) => translateInline(locale, source);
  const [activePlatform, setActivePlatform] = useState<'cf' | 'zip' | 'tencent' | 'aliyun'>('cf');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4 px-1 text-sm leading-6 sm:space-y-6 sm:px-0">
      {/* Deployment guide intro */}
      <div className="grid items-start gap-4">
        <div className="space-y-2 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-serif-sc text-xl font-bold text-slate-900 dark:text-slate-100 md:text-2xl"><HelpCircle className="h-6 w-6 text-rose-500"/><span>{tx('（说明）')}</span></h2>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{tx('项目存储架构：D1 保存用户/订单/对话/站点结构化内容与文件索引；R2 保存原始图片、视频、电子书等二进制文件；KV 只用于验证码限流等短期数据，不应用作权威内容库。浏览器 localStorage/IndexedDB 仅作缓存和临时草稿。推荐绑定 DB=D1、R2_BUCKET=R2；大文件上传必须使用 R2。')}</p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{tx('大文件上传需要绑定 Cloudflare R2；本项目当前采用 8 MiB 分块、最多 10,000 块，应用有效上限为 78.125 GiB（约 83.9 GB）；R2 服务自身上限 5 TiB。断线后暂不支持续传，实际仍受对象存储配额、网络与浏览器限制。')}</p>
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">Policies/法律页面内容为政策草稿，不是自动代写的有效法律意见；发布前请按主体、真实服务及适用法律审查。</p>
        </div>
      </div>

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" aria-label="功能使用说明">
        {[
          ['登录与注册', '支持用户名密码注册及邮箱验证码注册；忘记密码可用注册邮箱验证码重置。管理员登录依赖服务端 ADMIN_PASSWORD 与 ADMIN_SESSION_SECRET。纯静态托管没有后端 API，不能提供真实账户与鉴权。'],
          ['设置、主题与字体', '设置区可调整主题配色、背景、透明卡片与隐私选项；提供预置主题和安全的主题 JSON 导入。系统默认字体、楷书、幼圆、秦篆可切换；自定义字体保存在本机 IndexedDB，并可尝试上传到对象存储以便跨设备使用。'],
          ['博客、书籍、相册与影音', '已发布博客、书架、照片与媒体目录通过全栈后端同步；附件本体需 R2 或兼容对象存储。相册优先加载缩略图，原图按需打开。仅前端静态部署不具备这些服务端同步和上传能力。'],
          ['商品商城、订单与订单回收站', '管理员可维护商品目录，访客可按站点配置浏览并下单；支付及订单状态更新需要部署对应服务端 API 和支付网关凭据。订单可先移入回收站；在回收站可逐笔恢复或永久删除，也可勾选多笔批量删除。永久删除不可恢复，支付审计记录仍保留。'],
          ['邮件中枢与同步记事本', '邮件中枢提供发信配置、收信/邮件查看等能力，验证码及业务邮件需要服务端环境变量与邮件供应商配置。同步记事本仅管理员会话可读写，保存到 D1；支持多条文字及图片 URL，图片上传依赖对象存储。'],
          ['站长对话板、网站与图床', '登录用户可在设置区与站长进行持久对话，消息保存在服务端数据库；支持文字、图片和常见文件附件（单个附件最多 20 MiB，每条消息最多 5 个，合计最多 25 MiB）。图片/文件先上传到已配置的持久对象存储，再以链接发送；若上传只能保存到本机缓存，不能作为跨设备附件发送。网站/图床区用于管理和浏览网址、书签；图床上传和跨设备文件读取依赖后端与对象存储。'],
          ['备份、支付、部署与存储', 'WebDAV 备份是独立链路，适合小型结构化内容，不应作为大型媒体可靠灾备。Cloudflare Pages 全栈需 Functions、D1（DB）及按需 R2/KV；支付必须另配网关 Secrets。Docker/Node 可提供全栈服务；ESA、Vercel、OSS 等纯静态部署不会自动提供项目 API。'],
        ].map(([title, body]) => <details key={title} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-slate-900 marker:hidden dark:text-slate-100">{title}<span className="float-right text-sky-600" aria-hidden="true">＋</span></summary>
          <p className="break-words px-4 pb-4 text-xs leading-6 text-slate-600 dark:text-slate-300">{body}</p>
        </details>)}
      </section>
      <details className="min-w-0 rounded-2xl border border-slate-200 dark:border-slate-800">
        <summary className="cursor-pointer px-4 py-3 font-semibold">旧版部署、存储额度与服务端配置详解（展开查看）</summary>
        <div className="min-w-0 space-y-4 overflow-hidden pt-3">
      {/* Storage Free Tiers & Paid Pricing Reference */}
      <section className="rounded-3xl border border-sky-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-sky-500" />
            <span>各存储器免费额度与收费标准参考（D1 / R2 / KV / COS / OSS）</span>
          </h3>
          <span className="text-[11px] text-slate-400">以各云厂商控制台最新公布费率为准</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                <th className="py-2 pr-3 font-semibold">存储服务</th>
                <th className="py-2 pr-3 font-semibold">免费额度（Free Tier）</th>
                <th className="py-2 pr-3 font-semibold">付费与超额参考</th>
                <th className="py-2 font-semibold">在本项目中的推荐用途</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="py-2.5 pr-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">Cloudflare D1</td>
                <td className="py-2.5 pr-3">总容量 <b>5 GB</b>；每日 <b>500 万次</b>行读（Rows Read）、<b>10 万次</b>行写（Rows Written）</td>
                <td className="py-2.5 pr-3">Workers Paid $5/月起；超额约 $0.75/GB-月、$0.001/百万行读、$1.00/百万行写</td>
                <td className="py-2.5">账号、订单、对话、来信、站点文章等结构化数据（绑定名 <code className="font-mono">DB</code>）</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">Cloudflare R2</td>
                <td className="py-2.5 pr-3">每月 <b>10 GB</b> 存储；每月 <b>100 万次</b> Class A 写入、<b>1,000 万次</b> Class B 读取；<b>出站流量永久 $0 免费</b></td>
                <td className="py-2.5 pr-3">$0.015/GB-月；Class A $4.50/百万次、Class B $0.36/百万次；公网下载回源不收流量费</td>
                <td className="py-2.5">图片、音视频、电子书、字体与大文件分块（绑定名 <code className="font-mono">R2_BUCKET</code>）</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">Cloudflare KV</td>
                <td className="py-2.5 pr-3">总容量 <b>1 GB</b>；每日 <b>10 万次</b>读取；<b>每日仅 1,000 次写入/删除/列举</b></td>
                <td className="py-2.5 pr-3">Workers Paid $5/月含更高配额；超额约 $0.50/GB-月、$0.50/百万次读、$5.00/百万次写</td>
                <td className="py-2.5">仅短期验证码/限流等缓存回退（绑定名 <code className="font-mono">KV</code>），切勿作主库</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">腾讯云 COS</td>
                <td className="py-2.5 pr-3">通常仅面向新用户提供半年期/限额试用包（如 50 GB 试用），无永久大额免费</td>
                <td className="py-2.5 pr-3">标准存储约 ¥0.099–¥0.118/GB-月；公网下行流量约 ¥0.50/GB（另计请求次数）</td>
                <td className="py-2.5">作为 R2 不可用时的服务端 S3 兼容外部对象桶后备（<code className="font-mono">OBJECT_STORAGE_PROVIDER=cos</code>）</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-bold text-orange-600 dark:text-orange-400 whitespace-nowrap">阿里云 OSS</td>
                <td className="py-2.5 pr-3">新用户一般提供 3 个月试用资源包，到期后按量或资源包续费，无永久大额免费</td>
                <td className="py-2.5 pr-3">本地冗余标准存储约 ¥0.12/GB-月；外网流出流量约 ¥0.25–¥0.50/GB（分时段/区域）</td>
                <td className="py-2.5">作为 R2 不可用时的服务端 OSS SigV4 后备（<code className="font-mono">OBJECT_STORAGE_PROVIDER=oss</code>）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          省钱提示：个人站点优先绑定 Cloudflare <b>D1 + R2</b>——R2 免出站流量费且含 10 GB 免费空间；相册区已支持“列表与预览优先加载超轻量 WebP 缩略图，按需点击再看原图”，可大幅降低 R2 Class B 请求与访客流量消耗。
        </p>
      </section>

      {/* Platform Switcher Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActivePlatform('cf')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activePlatform === 'cf'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span>{tx('Cloudflare Pages Git 一键拉取部署 (首选优先)')}</span>
        </button>

        <button
          onClick={() => setActivePlatform('zip')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activePlatform === 'zip'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>{tx('Pages 一键上传文件部署 (获取上传包说明)')}</span>
        </button>

        <button
          onClick={() => setActivePlatform('tencent')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activePlatform === 'tencent'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>{tx('腾讯云 EdgeOne / 轻量服务器静态部署（COS 未接入）')}</span>
        </button>

        <button
          onClick={() => setActivePlatform('aliyun')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            activePlatform === 'aliyun'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>{tx('阿里云 ESA Pages GitHub 自动部署')}</span>
        </button>

        <button
          onClick={() => setActivePlatform('others' as any)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition whitespace-nowrap ${
            (activePlatform as string) === 'others'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>{tx('Vercel / Docker / VPS / 1Panel 极速部署')}</span>
        </button>
      </div>

      {/* TAB CONTENT: Cloudflare Pages Git Pull Deploy */}
      {activePlatform === 'cf' && (
        <div className="min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-rose-500" />
              <span>{tx('Cloudflare Pages 连接 Git 仓库自动构建部署与 D1 / R2 绑定')}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {tx('只需将代码提交至 GitHub / GitLab，Cloudflare Pages 将在您推送代码时全自动触发构建并全球分发。')}
            </p>
          </div>

          {/* Step 1: Git Connect */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">
                1
              </span>
              <span>{tx('创建 Cloudflare Pages 应用')}</span>
            </h4>
            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
              <li>登录进入 Cloudflare Dashboard 控制台，点击左侧导航栏中的 <b>Workers & Pages</b>。</li>
              <li>点击 <b>Create application</b>，切换标签至 <b>Pages</b>，选择 <b>Connect to Git</b>。</li>
              <li>授权并选择包含本项目的 <b>fox3</b> Git 仓库。</li>
            </ol>
          </div>

          {/* Step 2: Build Configurations */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">
                2
              </span>
              <span>{tx('构建与输出参数配置 (Build Settings)')}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block font-sans">Framework preset</span>
                <span className="font-bold text-rose-500">Vite</span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block font-sans">Build command</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">npm run build</span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block font-sans">Build output directory</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">dist</span>
              </div>
            </div>
          </div>

          {/* Step 3: D1 & R2 Cloud Bindings */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">
                3
              </span>
              <span>{tx('Cloudflare 后台绑定 D1 数据库、R2 存储桶与 KV 变量')}</span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {tx('部署完成后，进入项目页面点击 Settings -> Functions，向下滚动到 Bindings (绑定)：')}
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <b className="text-slate-800 dark:text-slate-100">D1 Database 绑定：</b>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    变量名称填写为 <code className="text-rose-500 font-mono font-bold">DB</code>，选择创建的 fox3-d1 数据库。
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard('DB', 'd1_var')}
                  className="px-2.5 py-1 text-slate-400 hover:text-rose-500 rounded border text-[11px]"
                >
                  {copiedKey === 'd1_var' ? '已复制' : '复制变量名'}
                </button>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <b className="text-slate-800 dark:text-slate-100">R2 Bucket 绑定：</b>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    变量名称填写为 <code className="text-rose-500 font-mono font-bold">R2_BUCKET</code>，选择创建的 fox3-media 存储桶。
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard('R2_BUCKET', 'r2_var')}
                  className="px-2.5 py-1 text-slate-400 hover:text-rose-500 rounded border text-[11px]"
                >
                  {copiedKey === 'r2_var' ? '已复制' : '复制变量名'}
                </button>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <b className="text-slate-800 dark:text-slate-100">KV Namespace 绑定：</b>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    变量名称填写为 <code className="text-rose-500 font-mono font-bold">KV</code>，选择创建的 fox3-kv 空间。
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard('KV', 'kv_var')}
                  className="px-2.5 py-1 text-slate-400 hover:text-rose-500 rounded border text-[11px]"
                >
                  {copiedKey === 'kv_var' ? '已复制' : '复制变量名'}
                </button>
              </div>
            </div>

            {/* Admin Environment Variables */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
              <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                4. 部署密码与管理员账号环境变量 (Environment Variables)
              </h5>
              <p className="text-xs text-slate-500 mb-2">
                管理员自行设定至少 6 个字符的登录密码（可使用数字、字母、符号或组合），并在 <b>Settings</b> -&gt; <b>Variables and Secrets</b> 中配置；网站前台不能修改 Cloudflare 部署变量：
              </p>
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <code className="text-rose-500 font-mono font-bold">ADMIN_USERNAME</code>
                    <span className="text-slate-500 dark:text-slate-400 ml-2">唯一超级管理员用户名（默认为 <code>fox</code>，受系统级唯一性严格保护）</span>
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <code className="text-rose-500 font-mono font-bold">ADMIN_PASSWORD</code>
                    <span className="text-slate-500 dark:text-slate-400 ml-2">管理员自选的生产登录密码（至少 6 个字符，可用纯数字或其他字符）；仅在 Cloudflare Pages Secret 中修改，未配置时管理员登录会被拒绝</span>
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <code className="text-rose-500 font-mono font-bold">ADMIN_SESSION_SECRET</code>
                    <span className="text-slate-500 dark:text-slate-400 ml-2">必须独立配置至少 32 个字符的高熵随机会话签名 Secret；此项不是登录密码，不能用 ADMIN_PASSWORD 替代</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 p-3 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
                普通用户建议使用真实可访问的邮箱注册。邮箱验证码校验通过后，账户资料和密码哈希写入 D1（绑定名 DB）；忘记密码可通过邮箱验证码重置，重置服务依赖 D1 与已配置的后台邮件发信变量。未绑定邮箱的账号不能自助找回密码。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Direct ZIP Upload Package Instructions */}
      {activePlatform === 'zip' && (
        <div className="min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Upload className="w-5 h-5 text-rose-500" />
              <span>Pages 一键直接上传文件部署与获取上传包方式</span>
            </h3>
            <p className="text-xs text-slate-500">
              此 ZIP 只包含静态前端资源，适用于预览/纯静态功能。它不包含 Pages Functions 及 D1/R2/KV 绑定；账户、验证码邮件、后台邮件、跨设备站点内容（D1 binding 必须名为 DB）和远程文件服务需要另行部署 Functions 并绑定资源。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              第一步：如何获取上传部署包？
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              在本地或开发环境的终端中，运行内置的打包命令：
            </p>
            <div className="p-3 bg-slate-950 text-slate-100 rounded-xl text-xs font-mono flex items-center justify-between">
              <code>npm run build</code>
              <button
                onClick={() => copyToClipboard('npm run build', 'build_cmd')}
                className="text-slate-400 hover:text-white"
              >
                {copiedKey === 'build_cmd' ? '已复制' : '复制命令'}
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              运行完成后，脚本会在项目根目录自动打包生成预备好的上传包：
              <code className="text-rose-500 font-bold ml-1 font-mono">dist-upload.zip</code> 或{' '}
              <code className="text-rose-500 font-bold ml-1 font-mono">dist/</code> 文件夹。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              第二步：在 Cloudflare Pages 控制台拖拽上传
            </h4>
            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
              <li>打开 Cloudflare 控制台 -&gt; <b>Workers & Pages</b> -&gt; <b>Create application</b>。</li>
              <li>选择 <b>Pages</b>，然后选择 <b>Direct Upload (直接上传)</b>。</li>
              <li>填写项目名称（如 <code>fox3</code>），上传 <code>dist</code> 静态文件；此方式不会把仓库根目录的 <code>functions/</code> 路由一并部署。</li>
              <li>点击 <b>Deploy site</b>，几秒内即可全球上线并获得 <code>*.pages.dev</code> 免费公网域名！</li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Tencent Cloud */}
      {activePlatform === 'tencent' && (
        <div className="min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-500" />
              <span>腾讯云部署说明（COS 服务端对象存储后备）</span>
            </h3>
            <p className="text-xs text-slate-500">
              可将前端静态页面部署到 EdgeOne 或轻量服务器；纯静态托管不会自动提供 Cloudflare Pages Functions、D1/R2/KV，也不会运行本文介绍的 COS 适配器。本站账户、邮件验证码、后台邮件与站点内容数据库 API 仍需部署 Pages Functions；跨设备内容必须配置 D1 binding `DB`。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              方案 A：腾讯云 EdgeOne Pages 静态托管
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              在 EdgeOne 控制台进入 Pages 服务，绑定 Git 仓库，构建目录指定为 <code>dist</code>，享受中国大陆顶级全站加速与防御能力。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              腾讯云 COS 对象存储后备（由 Cloudflare Pages Functions 调用）
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Pages Functions 已提供腾讯 COS S3-compatible 对象接口适配器。文件首先写入/读取 Cloudflare R2；R2 不可用时才尝试 COS。COS 配置只在 Cloudflare Pages 的 Functions Variables/Secrets 中填写，不要放进前端设置、构建参数或公开仓库。
            </p>
            <div className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono space-y-1">
              <p>设置 <code>OBJECT_STORAGE_PROVIDER=cos</code>、<code>COS_SECRET_ID</code>、<code>COS_SECRET_KEY</code>、<code>COS_REGION</code>（例如 <code>ap-guangzhou</code>）与 <code>COS_BUCKET</code>。</p>
              <p><code>COS_BUCKET</code> 必须填写带 APPID 的完整桶名（例如 <code>mybucket-1250000000</code>）。未单独适配的平台可选择 <code>OBJECT_STORAGE_PROVIDER=s3</code>，并提供 HTTPS <code>S3_ENDPOINT</code>、地域、桶名和 SigV4 凭据；通用接口要求兼容 path-style 请求。文件顺序为 R2 → 已选对象桶 → D1（≤1 MiB）/KV（≤18 MiB）/易失内存（≤4 MiB）；对象存储状态灯会执行只读连通探测。</p>
              <p>EdgeOne/OSS 静态部署仅提供前端，不会自动执行 Pages Functions；D1 中的账户和博客共享数据不会迁移到 COS。</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{tx('超过 80 MiB 的文件使用 R2 分块上传；需绑定 R2_BUCKET。R2 服务单对象上限为 5 TiB；但本项目当前 8 MiB 分块最多 10,000 块，应用有效上限为 78.125 GiB（约 83.9 GB）。当前不支持断线自动续传。COS/OSS/S3 后备仍经过 Pages Functions 单请求上传，不能通过本分块功能上传超大文件；若文件只落入 IndexedDB，仅原设备可访问。')}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              方案 B：腾讯云轻量服务器 Nginx 配置
            </h4>
            <div className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono space-y-1">
              <p>server &#123;</p>
              <p className="pl-4">listen 80;</p>
              <p className="pl-4">server_name yourdomain.com;</p>
              <p className="pl-4">root /var/www/fox3/dist;</p>
              <p className="pl-4">index index.html;</p>
              <p className="pl-4">location / &#123;</p>
              <p className="pl-8">try_files $uri $uri/ /index.html;</p>
              <p className="pl-4">&#125;</p>
              <p>&#125;</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Aliyun */}
      {activePlatform === 'aliyun' && (
        <div className="min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-orange-500" />
              <span>{tx('阿里云部署说明（ESA Pages GitHub 自动构建 + OSS 后备）')}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {tx('阿里云 ESA Pages 可从 GitHub 拉取仓库并自动构建、发布 Vite 前端静态文件；纯静态托管不会自动运行 Cloudflare Pages Functions、D1/R2/KV，也不会执行下方 OSS 适配器。账户、验证码发信及云同步 API 仍需兼容的服务端运行环境。')}
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900 dark:bg-orange-950/20">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{tx('阿里云 ESA Pages GitHub 仓库拉取部署')}</h4>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{tx('此配置运行 Vite 构建并发布 dist/，并为前端单页路由启用 index.html 回退。')}</p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <li>{tx('在阿里云控制台开通 ESA，进入 Pages，连接 GitHub 并选择本仓库和生产分支。')}</li>
              <li>{tx('仓库根目录的 esa.jsonc 已提供 npm install、npm run build、dist 静态目录和单页应用回退配置；保存后推送即可触发自动构建。')}</li>
              <li>{tx('首次可在 ESA Pages 控制台检查构建日志和预览；之后向所选生产分支推送代码，ESA 会重新拉取构建。')}</li>
            </ol>
            <p className="text-xs font-semibold leading-relaxed text-rose-700 dark:text-rose-300">{tx('重要限制：阿里云 ESA 静态 Pages 只负责构建和提供前端文件，不会自动运行本项目的 Cloudflare Pages Functions、D1、R2 或 KV。')}</p>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{tx('如需账户、跨设备同步、订单支付、收件 Webhook、文件上传和管理员 API，必须另行部署兼容的服务端 API 与数据库；仅静态部署这些功能不会工作。')}</p>
            <div className="flex flex-wrap gap-3 text-xs">
              <a className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400" href="https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/connect-pages-to-github" target="_blank" rel="noreferrer">ESA 从 GitHub 连接 Pages <ExternalLink className="h-3 w-3" /></a>
              <a className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400" href="https://help.aliyun.com/document_detail/2980182.html" target="_blank" rel="noreferrer">esa.jsonc 配置说明 <ExternalLink className="h-3 w-3" /></a>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              阿里云 OSS 静态托管快速指引
            </h4>
            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
              <li>在阿里云控制台创建 Bucket，权限设置为“公共读”。</li>
              <li>在基础设置中开启“静态页面”，默认首页设置为 <code>index.html</code>，404 错误页设置为 <code>index.html</code>。</li>
              <li>将 <code>dist/</code> 下所有编译生成的文件上传至该存储桶。</li>
              <li>绑定您的独立域名并申请免费 SSL 证书，享受高可用全球分发！</li>
            </ol>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              阿里云 OSS 对象存储后备（由 Cloudflare Pages Functions 调用）
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Pages Functions 已提供 OSS Signature V4 对象接口适配器。文件首先使用 Cloudflare R2；R2 不可用时才尝试 OSS。访问密钥只在 Cloudflare Pages 的 Functions Variables/Secrets 配置，不要写入网页代码或公开仓库。
            </p>
            <div className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono space-y-1">
              <p>设置 <code>OBJECT_STORAGE_PROVIDER=oss</code>、<code>OSS_ACCESS_KEY_ID</code>、<code>OSS_ACCESS_KEY_SECRET</code>、<code>OSS_REGION</code>（例如 <code>cn-hangzhou</code>）与 <code>OSS_BUCKET</code>。</p>
              <p>文件顺序为 R2 → OSS → D1（≤1 MiB）/KV（≤18 MiB）/易失内存（≤4 MiB）。连通灯会发起只读 Bucket 请求；D1 账户、验证码和同步数据不会迁移到 OSS。</p>
              <p>OSS 静态托管只提供前端；请勿在浏览器客户端或公开静态资源中嵌入任何云存储密钥。</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{tx('超过 80 MiB 的文件使用 R2 分块上传；需绑定 R2_BUCKET。R2 服务单对象上限为 5 TiB；但本项目当前 8 MiB 分块最多 10,000 块，应用有效上限为 78.125 GiB（约 83.9 GB）。当前不支持断线自动续传。COS/OSS/S3 后备仍经过 Pages Functions 单请求上传，不能通过本分块功能上传超大文件；若文件只落入 IndexedDB，仅原设备可访问。')}</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Vercel, Docker, VPS, 1Panel */}
      {(activePlatform as string) === 'others' && (
        <div className="min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-500" />
              <span>Vercel / Docker / VPS 独立服务器 / 1Panel 面板一键部署指南</span>
            </h3>
            <p className="text-xs text-slate-500">
              项目自带 <code>vercel.json</code>、<code>Dockerfile</code>、<code>docker-compose.yml</code> 与 <code>nginx.conf</code>，全平台无缝兼容。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              1. Vercel 一键拉取部署
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              在 Vercel 导入 Git 仓库，Framework Preset 选择 <b>Vite</b>，根目录留空，构建命令 <code>npm run build</code>，输出目录 <code>dist</code>，仓库内已包含 <code>vercel.json</code> 自动处理单页 SPA 路由。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              2. Docker & docker-compose 一键启动
            </h4>
            <div className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono space-y-1">
              <p># 克隆仓库并启动容器</p>
              <p>git clone &lt;repo-url&gt; && cd fox3</p>
              <p>docker-compose up -d --build</p>
              <p># 访问 http://&lt;你的IP&gt;:8080 即可直接使用！</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              3. 1Panel 面板极速部署说明
            </h4>
            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
              <li>在 1Panel 面板中选择 <b>网站</b> -&gt; <b>创建网站</b> -&gt; <b>静态网站</b> 或 <b>反向代理</b>。</li>
              <li>将项目打包出的 <code>dist/</code> 静态文件上传至站点根目录，或使用 1Panel 的 <b>容器编排</b> 粘贴仓库自带的 <code>docker-compose.yml</code>。</li>
              <li>在站点配置中开启 HTTPS，一键完成部署。</li>
            </ol>
          </div>
        </div>
      )}

      {/* Commercial (Shop) & Mail General Guides (Separated from Alipay & Resend specifics) */}
      <section className="rounded-3xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/20">
        <h3 className="mb-3 font-bold text-rose-800 dark:text-rose-200">{tx('支付接入通用总览：商户资质、D1 迁移与回调验签（各渠道通用原则）')}</h3>
        <div className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          <p>{tx('开始前准备：企业/个体户营业执照、法人身份证和结算账户。网站必须启用 HTTPS；中国大陆服务器需完成 ICP 备案，微信 PC 网站支付要求使用已备案域名。')}</p>
          <p>{tx('微信支付：在微信支付商户平台申请商户号，申请 Native（PC 扫码）或 H5 支付，准备 APIv3 密钥（32 字节）、商户 API 证书私钥、平台证书及 HTTPS 回调 URL。')}</p>
          <p>{tx('Stripe：注册账户并取得 Secret Key；在 Stripe Dashboard 创建 Webhook，保存 signing secret，并订阅成功、异步失败/过期及退款事件。')}</p>
          <p>{tx('PayPal：注册企业账户并创建 REST 应用，取得 Client ID、Secret 和 Webhook ID；先完整测试 Sandbox，再切换正式 API（支付宝专项配置请查看下方独立板块）。')}</p>
          <p>{tx('在 Cloudflare Pages → Settings → Variables and Secrets 中配置网关 Secrets，并绑定 D1（DB）；按顺序执行 migrations/0002_commerce.sql 和 migrations/0003_order_trash.sql 后重新部署。状态灯只表示服务端读到了变量，不代表密钥正确或商户已通过收款实测。')}</p>
          <p>{tx('安全回调流程：用户付款 → 支付平台向 notify_url POST 订单号、金额、状态和签名 → 后端验签 → 核对订单与金额 → 更新 D1 并返回成功。验签失败必须返回错误且不更新订单；重复通知必须幂等，不能依据前端跳转判断到账。')}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Shop Guide */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
            <Layers className="w-5 h-5" />
            <span>商业区 (商品展台与全渠道订单管理) 使用说明</span>
          </div>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <p><b>1. 展台与商品管理：</b>管理员可创建商品、管理多图轮播与自定义分类；商品目录与分类随 D1（<code>DB</code>）跨设备同步。订单数据必须写入 D1（按顺序执行 <code>migrations/0002_commerce.sql</code> 与 <code>migrations/0003_order_trash.sql</code>）。</p>
            <p><b>2. 环境变量清单（仅服务端 Secrets）：</b>微信：<code>WECHAT_MCHID</code>、<code>WECHAT_APPID</code>、<code>WECHAT_SERIAL_NO</code>、<code>WECHAT_PRIVATE_KEY</code>、<code>WECHAT_API_V3_KEY</code>、<code>WECHAT_PLATFORM_CERT</code>、<code>WECHAT_NOTIFY_URL</code>；Stripe：<code>STRIPE_SECRET_KEY</code>、<code>STRIPE_WEBHOOK_SECRET</code>；PayPal：<code>PAYPAL_CLIENT_ID</code>、<code>PAYPAL_CLIENT_SECRET</code>、<code>PAYPAL_WEBHOOK_ID</code>、<code>PAYPAL_API_BASE</code>（支付宝专题见下方独立指南）。</p>
            <p><b>3. 订单生命周期：</b>订单创建即落库 D1 并向管理员发站内提醒与未支付通知邮件；完成付款且验签通过后转为“已支付”方可发货；支持取消、移入回收站恢复、管理员原路退款与站内订单客服对话。</p>
            <p><b>4. 政策草稿说明：</b>商店内置法律/退款/隐私/服务条款可在后台编辑并保存至 D1，默认文本为参考草稿，正式上线前请按主体与适用法律核对。</p>
          </div>
        </div>

        {/* Mail Guide */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-500 font-bold text-sm">
            <Key className="w-5 h-5" />
            <span>邮箱区 (站内邮件中枢与 SMTP / 阿里 / 腾讯免费邮) 使用说明</span>
          </div>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <p><b>1. 邮箱区双区布局：</b>邮件中枢将“发信通道配置”与“收信配置”明确分离，分别管理外发邮件与收件同步，界面清晰互不混杂。</p>
            <p><b>2. 阿里云邮箱与腾讯企业邮箱免费版：</b>已在发信/收信配置区内置一键预设（阿里云免费企业邮 SMTP 465 SSL / IMAP 993 SSL；腾讯企业邮 <code>smtp.exmail.qq.com:465</code> / <code>imap.exmail.qq.com:993</code>）。注意需使用账号对应的<b>客户端专用密码 / 授权码</b>（而非网页登录密码）；在非纯静态的 Cloudflare Workers/Node 运行时上，IMAP 同步与 SMTP 发送均可配合服务端中继生效。</p>
            <p><b>3. 注册验证码与通用通道：</b>亦支持 SendGrid、Brevo、SendCloud 等标准发信渠道；后台自动通知与注册验证码需在 Cloudflare Pages Variables/Secrets 配置好服务商凭据与 <code>MAIL_SENDER</code>。</p>
            <p><b>4. 站内写信与回复：</b>管理员可在收件箱/发件箱/写信台查看来信并回复注册用户（Resend API 发信与收信完整步骤请阅读下方独立专题卡片）。</p>
          </div>
        </div>
      </div>

      {/* Standalone Section 9: Resend API Send & Receive Guide */}
      <section className="rounded-3xl border border-indigo-200/80 bg-white p-6 shadow-sm dark:border-indigo-900/50 dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-500" />
            <span>Resend API 发信与收信（Receiving）独立配置指南</span>
          </h3>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            独立专项指南 · 与邮箱区说明分离
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-slate-100">一、Resend API 发信配置流程</h4>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>登录 Resend 控制台 → <b>Domains</b> 添加您的发信域名，按提示在 DNS 解析后台添加 TXT (SPF) 与 CNAME (DKIM) 记录，等待状态变为 Verified。</li>
              <li>进入左侧 <b>API Keys</b> → 点击 <b>Create API Key</b>，选择对应域名并开启 Sending access，立即复制生成的 <code>re_xxx</code> 密钥。</li>
              <li>在 <b>Cloudflare Pages → Settings → Variables and Secrets</b> 添加：
                <div className="mt-1 rounded-xl bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-200 space-y-0.5">
                  <div>MAIL_PROVIDER=resend</div>
                  <div>RESEND_API_KEY=re_xxxxxxxxx</div>
                  <div>MAIL_SENDER=service@你的已验证域名</div>
                </div>
              </li>
              <li>保存并触发一次重新部署；即可用于注册验证码、订单邮件提醒及站长写信外发（测试投递请点击发信区测试按钮）。</li>
            </ol>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-slate-100">二、Resend API 收信（Receiving + Webhook）配置流程</h4>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>在 Resend 控制台打开目标域名详情，开启 <b>Receiving（邮件接收）</b> 开关，并按界面提示在 DNS 后台增加对应的 <b>MX 记录</b>（建议用单独子域或专用收件域）。</li>
              <li>进入 Resend <b>Webhooks</b> → <b>Add Webhook</b>：
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-slate-500 dark:text-slate-400">
                  <li>Endpoint URL 填写本站服务端回调：<code>https://你的站点域名/api/webhook</code>（也兼容 <code>/api/mail/webhook</code>）。</li>
                  <li>勾选监听事件：<code>email.received</code>。</li>
                </ul>
              </li>
              <li>创建后复制 Signing Secret（<code>whsec_xxx</code>），在 Cloudflare Pages Secrets 新增 <code>RESEND_WEBHOOK_SECRET</code> 并重新部署。</li>
              <li>来信流程：外部邮件到达 MX → Resend 推送 <code>email.received</code> 至 <code>/api/webhook</code> → 服务端验签通过后调用 Resend Receiving API 拉取完整正文 → 存入 D1（<code>DB</code>）收件箱（仅转发到个人邮箱不会写入本站 D1）。</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Standalone Section 10: Alipay Config & Usage Guide */}
      <section className="rounded-3xl border border-sky-200/80 bg-white p-6 shadow-sm dark:border-sky-900/50 dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-sky-700 dark:text-sky-300 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-sky-500" />
            <span>支付宝（Alipay）接入配置、密钥与扫码/网页收银使用说明</span>
          </h3>
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
            独立专项指南 · 与商业区说明分离
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-slate-100">一、支付宝开放平台产品签约与密钥准备</h4>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>登录支付宝开放平台创建网页&移动应用并完成上线审核；在「产品绑定/能力列表」按需签约：
                <ul className="list-disc list-inside pl-4 mt-1 text-slate-500 dark:text-slate-400">
                  <li><b>当面付</b>：支持服务端直出支付宝官方扫码收款码（<code>alipay.trade.precreate</code>）。</li>
                  <li><b>电脑网站支付 & 手机网站支付</b>：用于 PC 网页收银台跳转及内嵌扫码（即使未开通当面付，系统也可自动生成手机收银台扫码二维码 + 官方网页收银台）。</li>
                </ul>
              </li>
              <li>进入「开发设置 → 接口加签方式（RSA2 / 密钥）」，使用支付宝密钥工具生成 PKCS#8（推荐）或 PKCS#1 RSA2048 密钥对；将<b>应用公钥</b>上传到支付宝控制台后，复制控制台提供的<b>支付宝公钥</b>。</li>
              <li>填写应用网关与授权回调/异步通知地址：<code>https://你的站点域名/api/payments/webhook/alipay</code>。</li>
            </ol>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-slate-100">二、Cloudflare Secrets 变量与使用排查</h4>
            <div className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-sky-200 space-y-1">
              <div>ALIPAY_APP_ID=你的应用APPID</div>
              <div>ALIPAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...</div>
              <div>ALIPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...（注意是支付宝公钥，非应用公钥）</div>
              <div>ALIPAY_PID=2088...（可选，商户PID）</div>
              <div>ALIPAY_NOTIFY_URL=https://你的域名/api/payments/webhook/alipay（可选，默认自动拼接当前域名）</div>
              <div>ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do（沙箱测试改用沙箱网关）</div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              <b>使用流程与常见排查：</b>用户以普通账号下单后，系统立即弹出收款二维码并附带「前往支付宝网页收银台付款」及「官方内嵌扫码收银台」切换。若二维码未出或提示私钥错误，请检查：① 私钥切勿混入引号或公钥内容（支持 PKCS#8 / PKCS#1 及字面量 <code>\n</code>）；② <code>ALIPAY_PUBLIC_KEY</code> 必须填平台换取的“支付宝公钥”；③ 沙箱与正式网关的 APPID 及密钥不能混用。付款后系统会通过异步回调验签及「我已完成支付，立即核验到账状态」自动更新订单。
            </p>
          </div>
        </div>
      </section>
        </div>
      </details>
    </div>
  );
};
