import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Photo, ViewMode, PhotoFolder } from '../../types';
import { SafeImage } from '../common/SafeImage';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
  Download,
  CheckSquare,
  Square,
  Columns,
  Grid3X3,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  MoveRight,
  FolderOpen,
  Maximize2,
  Eye,
  Loader2,
} from 'lucide-react';
import JSZip from 'jszip';
import { ZoomableImage } from './ZoomableImage';
import { translateInline } from '../../utils/i18n';

export const GallerySection: React.FC = () => {
  const {
    photos,
    setPhotos,
    photoFolders,
    setPhotoFolders,
    currentUser,
    uploadFile,
    deleteUploadedFiles,
    viewModes,
    setViewMode,
    startTransfer,
    updateTransferPercent,
    finishTransfer,
    systemSettings,
    deviceMode,
    t,
    locale,
  } = useApp();
  const tx = (source: string) => translateInline(locale, source);

  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [previewDimensions, setPreviewDimensions] = useState<{ id: string; width: number; height: number } | null>(null);
  const [viewingOriginal, setViewingOriginal] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [targetFolderMove, setTargetFolderMove] = useState<string>('');
  const [listImageFitContain, setListImageFitContain] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentViewMode: ViewMode = viewModes['gallery'] || 'original';
  const canManagePhoto = (photo: Photo) => currentUser?.role === 'admin' || (Boolean(systemSettings.allowUserMediaManagement) && Boolean(currentUser) && ((Boolean(photo.ownerId) && photo.ownerId === currentUser?.id) || (!photo.ownerId && Boolean(photo.ownerUsername) && photo.ownerUsername === currentUser?.username)));
  const canUploadPhotos = currentUser?.role === 'admin' || (Boolean(currentUser) && Boolean(systemSettings.allowUserMediaManagement));

  const getDataSaverSrc = (photo: Photo): string => {
    if (photo.thumbnail && photo.thumbnail !== photo.url) return photo.thumbnail;
    if (/images\.unsplash\.com/i.test(photo.url)) {
      try {
        const parsed = new URL(photo.url);
        parsed.searchParams.set('w', '480');
        parsed.searchParams.set('q', '55');
        parsed.searchParams.set('auto', 'format');
        return parsed.toString();
      } catch {}
    }
    return photo.url;
  };

  const openPhotoModal = (photo: Photo) => {
    setViewingOriginal(false);
    setLoadingOriginal(false);
    setSelectedPhoto(photo);
  };

  const currentPhotoIndex = selectedPhoto ? photos.findIndex(p => p.id === selectedPhoto.id) : -1;

  const handlePrevPhoto = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (photos.length === 0 || currentPhotoIndex === -1) return;
    const prevIdx = (currentPhotoIndex - 1 + photos.length) % photos.length;
    openPhotoModal(photos[prevIdx]);
  };

  const handleNextPhoto = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (photos.length === 0 || currentPhotoIndex === -1) return;
    const nextIdx = (currentPhotoIndex + 1) % photos.length;
    openPhotoModal(photos[nextIdx]);
  };

  const filteredPhotos = photos.filter(p => {
    if (activeFolderId === 'all') return true;
    if (activeFolderId === 'uncategorized') return !p.folderId;
    return p.folderId === activeFolderId;
  });

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newF: PhotoFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      createdAt: Date.now(),
    };
    setPhotoFolders(prev => [...prev, newF]);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleMoveToFolder = (folderId: string) => {
    if (selectedIds.length === 0) return;
    const folder = photoFolders.find(f => f.id === folderId);
    setPhotos(prev =>
      prev.map(p =>
        selectedIds.includes(p.id)
          ? {
              ...p,
              folderId: folderId || undefined,
              folderName: folder?.name || undefined,
            }
          : p
      )
    );
    setSelectedIds([]);
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentFolder = photoFolders.find(f => f.id === activeFolderId);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uploaded = await uploadFile(file);
      let thumbnail: string | undefined;
      let width: number | undefined;
      let height: number | undefined;
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        const ratio = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const context = canvas.getContext('2d');
        context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const thumbBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.55))
          || await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.58));
        if (thumbBlob && thumbBlob.size < file.size) {
          const ext = thumbBlob.type.includes('webp') ? 'webp' : 'jpg';
          const thumbnailFile = new File([thumbBlob], `${file.name.replace(/\.[^/.]+$/, '')}-thumb.${ext}`, { type: thumbBlob.type || 'image/webp' });
          const uploadedThumbnail = await uploadFile(thumbnailFile);
          thumbnail = uploadedThumbnail.url;
        }
      } catch (error) {
        console.warn('Photo thumbnail/dimension processing unavailable; retaining original only:', error);
      }
      const newPhoto: Photo = {
        id: `photo-${Date.now()}-${i}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        originalFilename: file.name,
        url: uploaded.url,
        thumbnail,
        width,
        height,
        fileSize: file.size,
        ownerId: currentUser?.id,
        ownerUsername: currentUser?.username,
        category: currentFolder ? currentFolder.name : '相册精选',
        folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
        folderName: currentFolder?.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPhotos(prev => [newPhoto, ...prev]);
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === photos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(photos.map(p => p.id));
    }
  };

  const handleDeletePhoto = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = photos.find(p => p.id === id);
    if (!target || !canManagePhoto(target)) return;
    if (window.confirm('确认删除此照片吗？')) {
      const removedUserItemIds = currentUser?.role === 'admin' && target.ownerId && target.ownerId !== currentUser.id
        ? [target.id]
        : [];
      setPhotos(prev => prev.filter(p => p.id !== id));
      if (selectedPhoto?.id === id) setSelectedPhoto(null);
      void deleteUploadedFiles([target.url, target.thumbnail], {
        exclude: { photoIds: [id] },
        freedBytes: Number(target.fileSize) || undefined,
        removedUserItemIds,
      });
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const targets = photos.filter(p => selectedIds.includes(p.id) && canManagePhoto(p));
    if (targets.length === 0) return;
    if (window.confirm(`确认删除选中的 ${targets.length} 张照片吗？`)) {
      const deletedIds = targets.map(p => p.id);
      const urls = targets.flatMap(p => [p.url, p.thumbnail]);
      const freedBytes = targets.reduce((sum, p) => sum + (Number(p.fileSize) || 0), 0);
      const removedUserItemIds = currentUser?.role === 'admin'
        ? targets.filter(p => p.ownerId && p.ownerId !== currentUser.id).map(p => p.id)
        : [];
      setPhotos(prev => prev.filter(p => !deletedIds.includes(p.id)));
      setSelectedIds([]);
      if (selectedPhoto && deletedIds.includes(selectedPhoto.id)) setSelectedPhoto(null);
      void deleteUploadedFiles(urls, {
        exclude: { photoIds: deletedIds },
        freedBytes,
        removedUserItemIds,
      });
    }
  };

  const handleDownloadSingle = (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = photo.url;
    a.download = photo.originalFilename || `${photo.title}.jpg`;
    a.target = '_blank';
    a.click();
  };

  const handleBatchDownloadZip = async () => {
    if (selectedIds.length === 0) return;
    const targetPhotos = photos.filter(p => selectedIds.includes(p.id));
    startTransfer('download', `photos_batch_${targetPhotos.length}.zip`);

    const zip = new JSZip();
    for (let i = 0; i < targetPhotos.length; i++) {
      const p = targetPhotos[i];
      try {
        const resp = await fetch(p.url);
        const blob = await resp.blob();
        const zipEntryName = p.originalFilename || `${i + 1}_${p.title.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}.jpg`;
        zip.file(zipEntryName, blob);
      } catch {
        // Text stub if CORS blocks cross-origin demo URLs
        zip.file(`${p.originalFilename || p.title}.txt`, `URL: ${p.url}\nTitle: ${p.originalFilename || p.title}`);
      }
      updateTransferPercent(Math.round(((i + 1) / targetPhotos.length) * 80));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    updateTransferPercent(100);
    finishTransfer();

    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `fox3_gallery_batch_${Date.now()}.zip`;
    link.click();
  };

  // Layout classes
  const getLayoutClass = () => {
    if (deviceMode === 'mobile') {
      switch (currentViewMode) {
        case 'big':
          return 'grid grid-cols-1 gap-4';
        case 'medium':
        case 'original':
        default:
          return 'grid grid-cols-2 gap-3';
        case 'small':
          return 'space-y-3';
      }
    }

    switch (currentViewMode) {
      case 'big':
        return 'grid grid-cols-1 sm:grid-cols-2 gap-6';
      case 'medium':
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4';
      case 'small':
        return 'space-y-3';
      case 'original':
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6';
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
            <ImageIcon className="w-5 h-5 text-rose-500" />
            <span>{t('nav.gallery')} (支持 4 种视图与批量处理)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            大图、中图网格、小图详情与原布局浏览，支持批量上传、ZIP 打包下载与删除
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('gallery', 'big')}
              title={t('views.big')}
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'big' ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('gallery', 'medium')}
              title={t('views.medium')}
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'medium' ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('gallery', 'small')}
              title={t('views.small')}
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'small' ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs' : 'text-slate-400'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('gallery', 'original')}
              title={t('views.original')}
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'original' ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs' : 'text-slate-400'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            {currentViewMode === 'small' && (
              <button
                onClick={() => setListImageFitContain(value => !value)}
                title={tx(listImageFitContain ? '列表缩略图：完整显示' : '列表缩略图：填满画幅')}
                aria-label={tx(listImageFitContain ? '切换为裁切填满画幅' : '切换为完整自适应画幅')}
                aria-pressed={listImageFitContain}
                className={`p-1.5 rounded-lg transition ${listImageFitContain ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs' : 'text-slate-400'}`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canUploadPhotos && (
            <div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-xs font-semibold rounded-xl shadow-md transition"
              >
                <Plus className="w-4 h-4" />
                <span>{t('action.batchUpload')}</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUploadPhoto}
                accept="image/*"
                multiple
                className="hidden"
              />
            </div>
          )}
        </div>
      </div>

      {/* Folder / Album Navigation Bar */}
      <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 overflow-x-auto ${
        systemSettings.transparentCards
          ? 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveFolderId('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeFolderId === 'all'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>全部照片 ({photos.length})</span>
          </button>

          {photoFolders.map(folder => {
            const count = photos.filter(p => p.folderId === folder.id).length;
            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                  activeFolderId === folder.id
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span>{folder.name} ({count})</span>
              </button>
            );
          })}
        </div>

        {currentUser?.role === 'admin' && (
          <div className="flex items-center gap-2 shrink-0">
            {isCreatingFolder ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="新文件夹名称"
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <button
                  onClick={handleCreateFolder}
                  className="px-2.5 py-1 bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  创建
                </button>
                <button
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingFolder(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5 text-rose-500" />
                <span>新建相册文件夹</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Batch Operations & Move to Folder Bar */}
      <div className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
        systemSettings.transparentCards
          ? 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium hover:text-rose-500"
          >
            {selectedIds.length === filteredPhotos.length && filteredPhotos.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-rose-500" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>{t('action.selectAll')} ({selectedIds.length}/{filteredPhotos.length})</span>
          </button>

          {selectedIds.length > 0 && (
            <>
              {selectedIds.some(id => { const photo = photos.find(p => p.id === id); return photo ? canManagePhoto(photo) : false; }) && (
                <button
                  onClick={handleBatchDelete}
                  className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('action.batchDelete')} ({selectedIds.length})</span>
                </button>
              )}
              <button
                onClick={handleBatchDownloadZip}
                className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('action.batchDownload')} ({selectedIds.length})</span>
              </button>
            </>
          )}
        </div>

        {selectedIds.some(id => { const photo = photos.find(p => p.id === id); return photo ? canManagePhoto(photo) : false; }) && currentUser?.role === 'admin' && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px]">移至文件夹:</span>
            <select
              onChange={e => handleMoveToFolder(e.target.value)}
              defaultValue=""
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="" disabled>选择目标文件夹</option>
              {photoFolders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Gallery Grid */}
      <div className={getLayoutClass()}>
        {filteredPhotos.map(photo => {
          const isSelected = selectedIds.includes(photo.id);
          const listThumbSrc = getDataSaverSrc(photo);

          // Small list view
          if (currentViewMode === 'small') {
            return (
              <div
                key={photo.id}
                onClick={() => openPhotoModal(photo)}
                className={`p-3 rounded-2xl border shadow-sm flex items-center justify-between gap-4 cursor-pointer transition hover:shadow-md ${
                  isSelected ? 'ring-2 ring-rose-500' : ''
                } ${
                  systemSettings.transparentCards
                    ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={e => handleToggleSelect(photo.id, e)}
                    className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-rose-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <div className="w-16 h-12 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                    <SafeImage src={listThumbSrc} alt={photo.title} className="w-full h-full" imageClassName={listImageFitContain ? 'object-contain' : 'object-cover'} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {photo.originalFilename || photo.title}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {photo.width && photo.height ? `${photo.width.toLocaleString()} × ${photo.height.toLocaleString()} px · ` : ''}{new Date(photo.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                    onClick={e => handleDownloadSingle(photo, e)}
                    className="p-1.5 text-slate-400 hover:text-sky-500"
                    title={tx('下载原图')}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {canManagePhoto(photo) && (
                    <button
                      onClick={e => handleDeletePhoto(photo.id, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-500"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // Card or Original Grid
          return (
            <div
              key={photo.id}
              onClick={() => openPhotoModal(photo)}
              className={`group relative cursor-pointer overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all duration-300 aspect-[4/3] ${
                isSelected ? 'ring-4 ring-rose-500' : ''
              }`}
            >
              <SafeImage
                src={listThumbSrc}
                alt={photo.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Selection Checkbox on Image */}
              <button
                onClick={e => handleToggleSelect(photo.id, e)}
                className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-500 transition"
              >
                {isSelected ? <CheckSquare className="w-4 h-4 text-white" /> : <Square className="w-4 h-4 text-white/80" />}
              </button>

              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4 flex flex-col justify-end">
                <span className="text-xs font-semibold text-white drop-shadow truncate">
                  {photo.originalFilename || photo.title}
                </span>
                <span className="text-[10px] text-white/70">
                  {photo.category} • {new Date(photo.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Actions */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                <button
                  onClick={e => handleDownloadSingle(photo, e)}
                  className="p-1.5 bg-black/60 hover:bg-sky-600 text-white rounded-lg transition"
                  title={tx('下载原图')}
                >
                  <Download className="w-4 h-4" />
                </button>
                {canManagePhoto(photo) && (
                  <button
                    onClick={e => handleDeletePhoto(photo.id, e)}
                    className="p-1.5 bg-black/60 hover:bg-rose-600 text-white rounded-lg transition"
                    title="删除相片"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal with Data-Saver Preview + View Original Toggle */}
      {selectedPhoto && (() => {
        const dataSaverSrc = getDataSaverSrc(selectedPhoto);
        const hasDistinctOriginal = Boolean(dataSaverSrc && selectedPhoto.url && dataSaverSrc !== selectedPhoto.url);
        const activePreviewSrc = viewingOriginal || !hasDistinctOriginal ? selectedPhoto.url : dataSaverSrc;
        const sizeBadge = selectedPhoto.fileSize ? ` (${(selectedPhoto.fileSize / (1024 * 1024)).toFixed(2)} MB)` : '';
        return (
          <div
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in select-none"
          >
            {/* Top Controls */}
            <div className="absolute top-4 sm:top-6 right-4 sm:right-6 left-4 sm:left-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3 z-50">
              {hasDistinctOriginal && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    if (!viewingOriginal) {
                      setLoadingOriginal(true);
                      setViewingOriginal(true);
                    } else {
                      setLoadingOriginal(false);
                      setViewingOriginal(false);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition shadow-sm ${
                    viewingOriginal
                      ? 'bg-emerald-500/90 hover:bg-emerald-600 text-white'
                      : 'bg-sky-500 hover:bg-sky-600 text-white'
                  }`}
                >
                  {loadingOriginal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {loadingOriginal
                      ? '正在加载原图…'
                      : viewingOriginal
                        ? '原图已加载 · 切换省流预览'
                        : `查看原图${sizeBadge}`}
                  </span>
                </button>
              )}
              <span className="text-xs text-white/70 font-mono">
                {currentPhotoIndex + 1} / {photos.length}
              </span>
              <button
                onClick={e => handleDownloadSingle(selectedPhoto, e)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                title={tx('下载原图')}
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Left / Prev Arrow */}
            {photos.length > 1 && (
              <button
                onClick={handlePrevPhoto}
                className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition hover:scale-110"
                title="上一张 (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Center Image Container */}
            <div
              onClick={e => e.stopPropagation()}
              className="max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl flex flex-col items-center justify-center cursor-default"
            >
              <ZoomableImage
                key={selectedPhoto.id}
                src={activePreviewSrc}
                alt={selectedPhoto.title}
                locale={locale}
                onNaturalSize={(width, height) => {
                  setLoadingOriginal(false);
                  if (viewingOriginal || !hasDistinctOriginal) {
                    setPreviewDimensions({ id: selectedPhoto.id, width, height });
                    if ((!selectedPhoto.width || !selectedPhoto.height) && width > 0 && height > 0) {
                      setPhotos(previous => previous.map(photo => photo.id === selectedPhoto.id ? { ...photo, width, height } : photo));
                    }
                  }
                }}
              />
              <div className="mt-3 text-center text-white space-y-1">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <h3 className="text-base font-bold font-serif-sc break-words">{selectedPhoto.originalFilename || selectedPhoto.title}</h3>
                  {hasDistinctOriginal && !viewingOriginal && (
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] text-sky-200">
                      省流极速预览中
                    </span>
                  )}
                  {hasDistinctOriginal && viewingOriginal && !loadingOriginal && (
                    <span className="rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] text-emerald-200">
                      已显示 100% 原图
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/70">
                  {selectedPhoto.category}{(selectedPhoto.width && selectedPhoto.height) || previewDimensions?.id === selectedPhoto.id ? ` · ${(selectedPhoto.width || previewDimensions?.width)?.toLocaleString()} × ${(selectedPhoto.height || previewDimensions?.height)?.toLocaleString()} px` : ''} • {new Date(selectedPhoto.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Right / Next Arrow */}
            {photos.length > 1 && (
              <button
                onClick={handleNextPhoto}
                className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition hover:scale-110"
                title="下一张 (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
};
