import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { MediaItem, ViewMode } from '../../types';
import { SafeImage } from '../common/SafeImage';
import { translateInline } from '../../utils/i18n';
import { resolveFileUrl } from '../../utils/storage';
import {
  Play,
  Pause,
  Music,
  Film,
  Trash2,
  Plus,
  Disc3,
  Upload,
  Download,
  CheckSquare,
  Square,
  Columns,
  Grid3X3,
  List,
  LayoutGrid,
} from 'lucide-react';

const MediaPlayer: React.FC<{ item: MediaItem }> = ({ item }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(item.src);

  useEffect(() => {
    let cancelled = false;
    resolveFileUrl(item.src).then((url) => {
      if (!cancelled && url) setResolvedSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.src]);

  if (item.type === 'audio') {
    return (
      <audio
        src={resolvedSrc}
        controls
        autoPlay
        className="w-full mt-4 filter invert contrast-150 brightness-150"
      />
    );
  }

  return (
    <video
      src={resolvedSrc}
      controls
      autoPlay
      className="w-full max-h-80 rounded-xl mt-4 bg-black"
    />
  );
};

export const MediaSection: React.FC = () => {
  const {
    media,
    setMedia,
    currentUser,
    uploadFile,
    deleteUploadedFiles,
    viewModes,
    setViewMode,
    systemSettings,
    deviceMode,
    locale,
  } = useApp();
  const tx = (source: string) => translateInline(locale, source);

  const [currentPlaying, setCurrentPlaying] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // New Media Form state
  const [uploadTab, setUploadTab] = useState<'file' | 'link'>('file');
  const [onlineUrl, setOnlineUrl] = useState('');
  const [onlineTitle, setOnlineTitle] = useState('');
  const [onlineArtist, setOnlineArtist] = useState('');
  const [onlineType, setOnlineType] = useState<'audio' | 'video'>('audio');
  const [onlineCover, setOnlineCover] = useState('');

  // Batch operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const currentViewMode: ViewMode = viewModes['media'] || 'original';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManageMedia = (item: MediaItem) => currentUser?.role === 'admin' || (Boolean(systemSettings.allowUserMediaManagement) && Boolean(currentUser) && ((Boolean(item.ownerId) && item.ownerId === currentUser?.id) || (!item.ownerId && Boolean(item.ownerUsername) && item.ownerUsername === currentUser?.username)));
  const canUploadMedia = currentUser?.role === 'admin' || (Boolean(currentUser) && Boolean(systemSettings.allowUserMediaManagement));

  const togglePlay = (item: MediaItem) => {
    if (currentPlaying?.id === item.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentPlaying(item);
      setIsPlaying(true);
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === media.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(media.map(m => m.id));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const targets = media.filter(m => selectedIds.includes(m.id) && canManageMedia(m));
    if (targets.length === 0) return;
    if (window.confirm(`确认批量删除选中的 ${targets.length} 个音视频吗？`)) {
      const deletedIds = targets.map(m => m.id);
      const urls = targets.flatMap(m => [m.src, m.cover]);
      const freedBytes = targets.reduce((sum, m) => sum + (Number(m.fileSize) || 0), 0);
      const removedUserItemIds = currentUser?.role === 'admin'
        ? targets.filter(m => m.ownerId && m.ownerId !== currentUser.id).map(m => m.id)
        : [];
      setMedia(prev => prev.filter(m => !deletedIds.includes(m.id)));
      setSelectedIds([]);
      if (currentPlaying && deletedIds.includes(currentPlaying.id)) {
        setCurrentPlaying(null);
        setIsPlaying(false);
      }
      void deleteUploadedFiles(urls, {
        exclude: { mediaIds: deletedIds },
        freedBytes,
        removedUserItemIds,
      });
    }
  };

  const handleBatchDownload = () => {
    if (selectedIds.length === 0) return;
    const exportData = media.filter(m => selectedIds.includes(m.id));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fox3_media_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMediaFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const videoExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi', '.ogv'];
    const isVideo = file.type.startsWith('video/') ||
      videoExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    // Capture real video frame as poster cover if it's a video!
    let posterCover = isVideo
      ? 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=800&q=80'
      : 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80';
    let posterFile: File | null = null;

    let detectedDuration = isVideo ? '00:00' : '03:30';

    if (isVideo && typeof document !== 'undefined') {
      try {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        const videoObjectUrl = URL.createObjectURL(file);
        videoElement.src = videoObjectUrl;
        videoElement.muted = true;

        await new Promise<void>((resolve) => {
          let settled = false;
          let captureTimer: ReturnType<typeof setTimeout>;
          const finishCapture = () => {
            if (settled) return;
            settled = true;
            clearTimeout(captureTimer);
            URL.revokeObjectURL(videoObjectUrl);
            resolve();
          };
          videoElement.onloadeddata = () => {
            const minutes = Math.floor(videoElement.duration / 60);
            const seconds = Math.floor(videoElement.duration % 60);
            if (!isNaN(videoElement.duration) && videoElement.duration > 0) {
              detectedDuration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }

            // Seek slightly forward to capture frame
            videoElement.currentTime = Number.isFinite(videoElement.duration) && videoElement.duration > 0
              ? Math.min(1.0, videoElement.duration / 2)
              : 0;
          };

          videoElement.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              const sourceWidth = videoElement.videoWidth || 640;
              const sourceHeight = videoElement.videoHeight || 360;
              const scale = Math.min(1, 640 / sourceWidth);
              canvas.width = Math.max(1, Math.round(sourceWidth * scale));
              canvas.height = Math.max(1, Math.round(sourceHeight * scale));
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                  if (blob && blob.size > 0) posterFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-poster.jpg`, { type: 'image/jpeg' });
                  finishCapture();
                }, 'image/jpeg', 0.76);
                return;
              }
            } catch (canvasErr) {
              console.warn('Canvas video capture failed', canvasErr);
            }
            finishCapture();
          };

          videoElement.onerror = finishCapture;
          captureTimer = setTimeout(finishCapture, 8000);
        });
      } catch (err) {
        console.warn('Video thumbnail capture error:', err);
      }
    }

    const uploaded = await uploadFile(file);
    if (posterFile) {
      try {
        const uploadedPoster = await uploadFile(posterFile);
        if (!/^(?:idb_file_|data:|blob:)/i.test(uploadedPoster.url)) {
          posterCover = uploadedPoster.url;
        }
      } catch (error) {
        console.warn('Cloud video poster upload failed; using shared fallback cover', error);
      }
    }

    const newItem: MediaItem = {
      id: `media-${Date.now()}`,
      type: isVideo ? 'video' : 'audio',
      title: file.name.replace(/\.[^/.]+$/, '') || file.name,
      originalFilename: file.name,
      artist: currentUser?.username || 'fox',
      ownerId: currentUser?.id,
      ownerUsername: currentUser?.username,
      src: uploaded.url,
      cover: posterCover,
      duration: detectedDuration,
      fileSize: file.size,
      uploadedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setMedia(prev => [newItem, ...prev]);
    setIsUploading(false);
  };

  const handleDeleteMedia = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = media.find(m => m.id === id);
    if (!target || !canManageMedia(target)) return;
    if (window.confirm('确认删除该音视频吗？')) {
      const removedUserItemIds = currentUser?.role === 'admin' && target.ownerId && target.ownerId !== currentUser.id
        ? [target.id]
        : [];
      setMedia(prev => prev.filter(m => m.id !== id));
      if (currentPlaying?.id === id) {
        setCurrentPlaying(null);
        setIsPlaying(false);
      }
      void deleteUploadedFiles([target.src, target.cover], {
        exclude: { mediaIds: [id] },
        freedBytes: Number(target.fileSize) || undefined,
        removedUserItemIds,
      });
    }
  };

  // Get layout class
  const getLayoutClass = () => {
    if (deviceMode === 'mobile') {
      return 'grid grid-cols-1 gap-4';
    }

    switch (currentViewMode) {
      case 'big':
        return 'grid grid-cols-1 gap-6';
      case 'medium':
        return 'grid grid-cols-1 md:grid-cols-2 gap-5';
      case 'small':
        return 'space-y-3';
      case 'original':
      default:
        return 'grid grid-cols-1 md:grid-cols-2 gap-5';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div>
          <h2 className="text-xl font-bold font-serif-sc text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-sky-500 animate-spin-slow" />
            <span>影音天地 (Native Audio / Video Streaming)</span><span className="ml-2 text-[10px] font-normal text-amber-600">{tx('影音天地不适用于超过 90 MB 的大文件；此类文件请使用相册或书架等 R2 大文件分块上传入口。')}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            原生流媒体多媒体中心，支持音频流、高品质视频上传与自适应播放
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('media', 'big')}
              title="大图巨幕"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'big' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('media', 'medium')}
              title="双列网格"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'medium' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('media', 'small')}
              title="小图列表"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'small' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('media', 'original')}
              title="原布局"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'original' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {canUploadMedia && (
            <button
              onClick={() => setIsUploading(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>添加音视频</span>
            </button>
          )}
        </div>
      </div>

      {/* Batch Operations Bar */}
      {currentUser?.role === 'admin' && (
        <div className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
          systemSettings.transparentCards
            ? 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-white/20'
            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium hover:text-sky-500"
            >
              {selectedIds.length === media.length && media.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-sky-500" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>全选 ({selectedIds.length}/{media.length})</span>
            </button>

            {selectedIds.length > 0 && (
              <>
                <button
                  onClick={handleBatchDelete}
                  className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>批量删除 ({selectedIds.length})</span>
                </button>
                <button
                  onClick={handleBatchDownload}
                  className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>批量导出元数据</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active Player Box */}
      {currentPlaying && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-800 relative overflow-hidden animate-in fade-in">
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden shadow-lg border border-white/10 shrink-0">
              <SafeImage
                src={currentPlaying.cover}
                alt={currentPlaying.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 text-center md:text-left space-y-3 w-full">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-400 text-xs font-semibold">
                {currentPlaying.type === 'audio' ? <Music className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                <span>{currentPlaying.type === 'audio' ? '正在播放音频' : '正在播放视频'}</span>
              </div>

              <h3 className="text-xl md:text-2xl font-bold font-serif-sc break-words">{currentPlaying.originalFilename || currentPlaying.title}</h3>
              <p className="text-xs text-slate-400">{currentPlaying.artist}</p>

              {/* HTML5 Player */}
              <MediaPlayer
                item={currentPlaying}
              />
            </div>
          </div>
        </div>
      )}

      {/* Media Cards Grid */}
      <div className={getLayoutClass()}>
        {media.map(item => {
          const isSelected = selectedIds.includes(item.id);

          // Small Detail List View
          if (currentViewMode === 'small') {
            return (
              <div
                key={item.id}
                onClick={() => togglePlay(item)}
                className={`p-3 rounded-2xl border shadow-sm flex items-center justify-between gap-4 cursor-pointer transition hover:shadow-md ${
                  isSelected ? 'ring-2 ring-sky-500' : ''
                } ${
                  systemSettings.transparentCards
                    ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={e => handleToggleSelect(item.id, e)}
                      className="p-1 text-slate-400 hover:text-sky-500 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">
                    <SafeImage src={item.cover} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 shrink-0">
                        {item.type}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {item.originalFilename || item.title}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{item.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
                  <span className="font-mono">{item.duration}</span>
                  <button className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
                    {currentPlaying?.id === item.id && isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {canManageMedia(item) && (
                    <button
                      onClick={e => handleDeleteMedia(item.id, e)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                      title="删除媒体"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // Card View
          return (
            <div
              key={item.id}
              onClick={() => togglePlay(item)}
              className={`group cursor-pointer rounded-2xl p-4 border shadow-sm hover:shadow-lg transition-all duration-300 flex items-center gap-4 ${
                isSelected ? 'ring-2 ring-sky-500' : ''
              } ${
                systemSettings.transparentCards
                  ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              {currentUser?.role === 'admin' && (
                <button
                  onClick={e => handleToggleSelect(item.id, e)}
                  className="p-1 text-slate-400 hover:text-sky-500 shrink-0"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-sky-500" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}

              <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
                <SafeImage
                  src={item.cover}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {currentPlaying?.id === item.id && isPlaying ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-500">
                    {item.type}
                  </span>
                  {item.fileSize && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {(item.fileSize / 1024 / 1024).toFixed(2)} MB
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold font-serif-sc text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-500 transition">
                  {item.originalFilename || item.title}
                </h4>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <span>{item.artist}</span>
                  <span>•</span>
                  <span>时长: {item.duration}</span>
                  <span>•</span>
                  <span>{new Date(item.uploadedAt || item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {canManageMedia(item) && (
                <button
                  onClick={e => handleDeleteMedia(item.id, e)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                  title="删除媒体"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload / Online Media Modal */}
      {isUploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-serif-sc text-slate-900 dark:text-slate-100">
                添加音视频媒体
              </h3>
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setUploadTab('file')}
                  className={`px-3 py-1 rounded-lg transition ${
                    uploadTab === 'file'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  本地文件上传
                </button>
                <button
                  type="button"
                  onClick={() => setUploadTab('link')}
                  className={`px-3 py-1 rounded-lg transition ${
                    uploadTab === 'link'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  在线直链流媒体
                </button>
              </div>
            </div>

            {uploadTab === 'file' ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  支持 MP3, WAV, MP4, WebM 等流媒体格式，直传 Cloudflare R2 对象存储与跨端持久化。
                </p>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-sky-300 dark:border-sky-900/60 rounded-2xl p-8 text-center cursor-pointer hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition flex flex-col items-center justify-center gap-2"
                >
                  <Upload className="w-8 h-8 text-sky-500" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    点击选择音视频文件
                  </span>
                  <span className="text-[10px] text-slate-400">
                    .mp3, .wav, .mp4, .webm, .mkv
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleMediaFileUpload}
                  accept="audio/*,video/*,.mp4,.webm,.mov,.mkv,.m4v,.avi,.mp3,.wav,.ogg,.aac,.flac"
                  className="hidden"
                />
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!onlineUrl.trim()) return;
                  const newItem: MediaItem = {
                    id: `media-${Date.now()}`,
                    type: onlineType,
                    title: onlineTitle.trim() || '未命名网络音视频',
                    artist: onlineArtist.trim() || currentUser?.username || 'fox',
                    ownerId: currentUser?.id,
                    ownerUsername: currentUser?.username,
                    src: onlineUrl.trim(),
                    cover:
                      onlineCover.trim() ||
                      (onlineType === 'video'
                        ? 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=800&q=80'
                        : 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80'),
                    duration: '在线流媒体',
                    uploadedAt: Date.now(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  setMedia(prev => [newItem, ...prev]);
                  setOnlineUrl('');
                  setOnlineTitle('');
                  setOnlineArtist('');
                  setOnlineCover('');
                  setIsUploading(false);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    媒体类型
                  </label>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={onlineType === 'audio'}
                        onChange={() => setOnlineType('audio')}
                        name="onlineType"
                      />
                      <span>音频 (Music/Audio)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={onlineType === 'video'}
                        onChange={() => setOnlineType('video')}
                        name="onlineType"
                      />
                      <span>视频 (Video/Stream)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    流媒体直链 URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={onlineUrl}
                    onChange={(e) => setOnlineUrl(e.target.value)}
                    placeholder="https://example.com/audio.mp3 或 .mp4 直链"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    标题
                  </label>
                  <input
                    type="text"
                    value={onlineTitle}
                    onChange={(e) => setOnlineTitle(e.target.value)}
                    placeholder="例如: 晨曦纯音乐 / 精彩视频"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    艺术家 / 创作者
                  </label>
                  <input
                    type="text"
                    value={onlineArtist}
                    onChange={(e) => setOnlineArtist(e.target.value)}
                    placeholder="例如: WhiteFox 或 艺术家名字"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    封面图片 URL (可选)
                  </label>
                  <input
                    type="url"
                    value={onlineCover}
                    onChange={(e) => setOnlineCover(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUploading(false)}
                    className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl shadow-xs transition"
                  >
                    保存并立即在线播放
                  </button>
                </div>
              </form>
            )}

            {uploadTab === 'file' && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsUploading(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
