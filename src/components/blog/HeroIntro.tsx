import React, { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SafeImage } from '../common/SafeImage';
import { Sparkles, Camera, HardDrive, Compass, Edit3, Check, X } from 'lucide-react';

export const HeroIntro: React.FC = () => {
  const { systemSettings, updateSystemSettings, currentUser, uploadFile, deleteUploadedFiles } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const heroSrc = systemSettings.heroIntroImage || '/images/hero-default.jpg';

  const [isEditingText, setIsEditingText] = useState(false);
  const [editTitle, setEditTitle] = useState(systemSettings.heroTitle || '探索数字世界与全栈极简之美');
  const [editSubtitle, setEditSubtitle] = useState(
    systemSettings.heroSubtitle ||
      '融合 D1 + R2 + 邮件中枢与 WebDAV 容灾备份的现代化全栈博客系统'
  );
  const [editBadge, setEditBadge] = useState(systemSettings.heroBadge || '✨ 数字化知识库 & 个人空间');

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previousUrl = systemSettings.heroIntroImage;
    const res = await uploadFile(file);
    updateSystemSettings({ heroIntroImage: res.url });
    if (previousUrl && previousUrl !== res.url) {
      void deleteUploadedFiles([previousUrl]);
    }
    e.target.value = '';
  };

  const handleSaveText = () => {
    updateSystemSettings({
      heroTitle: editTitle,
      heroSubtitle: editSubtitle,
      heroBadge: editBadge,
    });
    setIsEditingText(false);
  };

  const handleCancelText = () => {
    setEditTitle(systemSettings.heroTitle || '探索数字世界与全栈极简之美');
    setEditSubtitle(systemSettings.heroSubtitle || '');
    setEditBadge(systemSettings.heroBadge || '');
    setIsEditingText(false);
  };

  return (
    <div className="relative mb-8 rounded-3xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-xl min-h-[290px] sm:min-h-[340px] flex items-center bg-slate-950">
      <div className="absolute inset-0 z-0">
        <SafeImage
          src={heroSrc}
          alt="Hero Banner"
          className="w-full h-full bg-slate-950"
          imageClassName="object-cover object-center filter brightness-[0.86] dark:brightness-[0.48]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/55 to-transparent" />
      </div>

      <div className="relative z-10 w-full flex flex-col justify-between px-6 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <div className="max-w-3xl space-y-3.5">
          {isEditingText ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/80 shrink-0">徽标标语:</span>
              <input
                type="text"
                value={editBadge}
                onChange={e => setEditBadge(e.target.value)}
                className="flex-1 px-2.5 py-1 rounded-lg text-xs bg-black/60 text-white border border-white/20 focus:outline-none focus:border-sky-400"
              />
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-white text-xs font-semibold backdrop-blur-md shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>{systemSettings.heroBadge || '✨ 数字化知识库 & 个人空间'}</span>
            </div>
          )}

          {isEditingText ? (
            <div>
              <label className="block text-xs text-white/80 mb-1">主标题:</label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-lg md:text-2xl font-bold bg-black/60 text-white border border-white/20 focus:outline-none focus:border-sky-400"
              />
            </div>
          ) : (
            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-black font-serif-sc tracking-tight text-white leading-tight drop-shadow-md">
              {systemSettings.heroTitle || '探索数字世界与全栈极简之美'}
            </h1>
          )}

          {isEditingText ? (
            <div>
              <label className="block text-xs text-white/80 mb-1">简介描述:</label>
              <textarea
                value={editSubtitle}
                onChange={e => setEditSubtitle(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-xs md:text-sm bg-black/60 text-white border border-white/20 focus:outline-none focus:border-sky-400"
              />
            </div>
          ) : (
            <p className="text-xs sm:text-sm lg:text-base text-slate-100/90 leading-relaxed font-normal max-w-2xl drop-shadow">
              {systemSettings.heroSubtitle ||
                '融合 D1 + R2 + 邮件中枢与 WebDAV 容灾备份的现代化全栈博客系统'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-white/90 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 shadow-sm">
              <HardDrive className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>真实存储用量请查看管理员设置</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-white/90 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 shadow-sm">
              <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>D1 + R2 原生无感同步</span>
            </div>
          </div>
        </div>

        {currentUser?.role === 'admin' && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            {isEditingText ? (
              <>
                <button
                  onClick={handleSaveText}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl backdrop-blur-md shadow-md transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存文字</span>
                </button>
                <button
                  onClick={handleCancelText}
                  className="flex items-center gap-1 px-3 py-1.5 bg-black/50 hover:bg-black/70 text-white text-xs font-semibold rounded-xl backdrop-blur-md transition"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>取消</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditingText(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-xl backdrop-blur-md border border-white/30 shadow-md transition"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-300" />
                <span>自定义介绍文字</span>
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-xl backdrop-blur-md border border-white/30 shadow-md transition"
              title="更换首页介绍区照片"
            >
              <Camera className="w-3.5 h-3.5 text-sky-300" />
              <span>更换首页介绍区照片</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleHeroImageUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
        )}
      </div>
    </div>
  );
};
