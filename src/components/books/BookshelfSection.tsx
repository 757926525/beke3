import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Book, ViewMode } from '../../types';
import { SafeImage } from '../common/SafeImage';
import JSZip from 'jszip';
import { parseEpubFile } from '../../utils/epubReader';
import { getFileFromIndexedDB } from '../../utils/storage';
import {
  BookOpen,
  Plus,
  Upload,
  Maximize2,
  Minimize2,
  X,
  Trash2,
  BookMarked,
  Download,
  CheckSquare,
  Square,
  Columns,
  Grid3X3,
  List,
  LayoutGrid,
  FileText,
  FileCode,
  Pencil,
} from 'lucide-react';

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB (${bytes.toLocaleString()} B)`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB (${bytes.toLocaleString()} B)`;
};
const bookOriginalFilename = (book: Book) => {
  if (book.displayFilename?.trim()) return book.displayFilename.trim();
  const fromDescription = book.description?.match(/原文件名[：:]\s*(.+?)(?:\s+\(\d+(?:\.\d+)?\s*(?:KB|KiB|MB|MiB|B)\))?$/i)?.[1]?.trim();
  const candidate = fromDescription || book.title;
  if (/\.[a-z0-9]{1,8}$/i.test(candidate)) return candidate;
  const titleFilename = candidate.match(/^(.+?\.[a-z0-9]{1,8})(?:\s+\(.+\))?$/i)?.[1];
  if (titleFilename) return titleFilename;
  const base = candidate.replace(/\.[^.\s]+$/, '');
  const extension = String(book.format || 'txt').toLowerCase();
  return `${base}.${extension}`;
};

export const BookshelfSection: React.FC = () => {
  const {
    books,
    setBooks,
    currentUser,
    uploadFile,
    deleteUploadedFiles,
    startTransfer,
    updateTransferPercent,
    startMultiTransfer,
    updateMultiTransferProgress,
    finishMultiTransfer,
    finishTransfer,
    viewModes,
    setViewMode,
    systemSettings,
    deviceMode,
  } = useApp();

  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [loadingRemoteText, setLoadingRemoteText] = useState(false);
  const [remoteTextError, setRemoteTextError] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(18);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const currentViewMode: ViewMode = viewModes['books'] || 'original';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManageBook = (book: Book) => currentUser?.role === 'admin' || (Boolean(systemSettings.allowUserMediaManagement) && Boolean(currentUser) && ((Boolean(book.ownerId) && book.ownerId === currentUser?.id) || (!book.ownerId && Boolean(book.ownerUsername) && book.ownerUsername === currentUser?.username)));
  const canUploadBooks = currentUser?.role === 'admin' || (Boolean(currentUser) && Boolean(systemSettings.allowUserMediaManagement));

  useEffect(() => {
    if (!readingBook || readingBook.content || readingBook.format === 'PDF' || !readingBook.fileUrl) return;
    if (!['EPUB', 'TXT'].includes(String(readingBook.format).toUpperCase())) return;
    let cancelled = false;
    const loadRemoteText = async () => {
      setLoadingRemoteText(true);
      setRemoteTextError('');
      try {
        let blob: Blob;
        if (readingBook.fileUrl.startsWith('idb_file_')) {
          const local = await getFileFromIndexedDB(readingBook.fileUrl);
          if (!local) throw new Error('当前设备找不到本地文件，请在原上传设备重新上传。');
          blob = local instanceof Blob ? local : await (await fetch(local)).blob();
        } else {
          const response = await fetch(readingBook.fileUrl, { cache: 'no-store' });
          if (!response.ok) throw new Error(`文件下载失败 (HTTP ${response.status})`);
          blob = await response.blob();
        }
        let text = '';
        if (String(readingBook.format).toUpperCase() === 'EPUB') {
          const parsed = await parseEpubFile(blob);
          text = parsed.fullText || '';
        } else {
          text = await blob.text();
        }
        if (!cancelled) setReadingBook(previous => previous?.id === readingBook.id ? { ...previous, content: text } : previous);
      } catch (error: any) {
        if (!cancelled) setRemoteTextError(error?.message || '无法从云端读取书籍正文');
      } finally {
        if (!cancelled) setLoadingRemoteText(false);
      }
    };
    void loadRemoteText();
    return () => { cancelled = true; };
  }, [readingBook?.id, readingBook?.content, readingBook?.fileUrl, readingBook?.format]);

  const handleBookFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setIsUploading(true);

    if (fileList.length > 1) {
      startMultiTransfer('upload', fileList.length, fileList[0].name);
    }

    const coverOptions: Record<string, string> = {
      EPUB: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      PDF: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80',
      TXT: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80',
      MOBI: 'https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?auto=format&fit=crop&w=400&q=80',
      AZW3: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=400&q=80',
      MD: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=400&q=80',
      DOCX: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=80',
    };

    const newBooks: Book[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (fileList.length > 1) {
        updateMultiTransferProgress(i + 1, file.name, Math.round(((i + 0.3) / fileList.length) * 100));
      }

      try {
        const extMatch = file.name.match(/\.([a-z0-9]{1,8})$/i);
        const ext = extMatch ? extMatch[1].toUpperCase() : 'TXT';
        const format = (['EPUB', 'PDF', 'TXT', 'MOBI', 'AZW3', 'DOCX', 'DOC', 'MD', 'JSON', 'RTF'].includes(ext)
          ? ext
          : ext || 'TXT') as any;

        const uploaded = await uploadFile(file);

        // Extract real text content for preview/reading
        let textContent = '';

        if (format === 'EPUB') {
          try {
            const parsed = await parseEpubFile(file);
            if (parsed.fullText && parsed.fullText.length > 30) {
              textContent = parsed.fullText;
            }
          } catch (e) {
            console.warn('Failed parsing epub:', e);
          }
        }

        if (format === 'TXT' || ext === 'TXT' || ext === 'MD' || ext === 'JSON' || file.type.includes('text')) {
          try {
            const text = await file.text();
            if (text && text.trim().length > 0) {
              textContent = text;
            }
          } catch (err) {
            console.warn('Text reading failed:', err);
          }
        }

        if (!textContent) {
          textContent = `《${file.name}》\n\n原上传文件名: ${file.name}\n文件格式: [${format}]  实际大小: ${(file.size / 1024 / 1024).toFixed(2)} MB (${file.size.toLocaleString()} 字节)\n上传时间: ${new Date().toLocaleString()}\n上传者: ${currentUser?.username || 'fox'}\n\n【文件在线阅读模式】\n实体数据已成功持久化并映射。您可直接在上方调整字体字号进行全屏沉浸式阅读，或随时点击“下载”获取该文件的原始二进制副本。`;
        }

        const createdBook: Book = {
          id: `book-${Date.now()}-${i}`,
          title: file.name,
          displayFilename: file.name,
          author: currentUser?.username || 'fox',
          ownerId: currentUser?.id,
          ownerUsername: currentUser?.username,
          format,
          cover: coverOptions[format] || coverOptions.EPUB,
          description: `原文件名：${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
          fileSize: file.size,
          fileUrl: uploaded?.url || '',
          content: textContent,
          progress: 5,
          createdAt: Date.now() - i * 1000,
          updatedAt: Date.now() - i * 1000,
        };

        newBooks.push(createdBook);
        if (fileList.length > 1) {
          updateMultiTransferProgress(i + 1, file.name, Math.round(((i + 1) / fileList.length) * 100));
        }
      } catch (err: any) {
        console.error('File upload error for', file.name, err);
      }
    }

    if (newBooks.length > 0) {
      setBooks(prev => [...newBooks, ...prev]);
    }

    if (fileList.length > 1) {
      finishMultiTransfer();
    }
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === books.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(books.map(b => b.id));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const deletedBooks = books.filter(b => selectedIds.includes(b.id) && canManageBook(b));
    if (deletedBooks.length === 0) return;
    if (window.confirm(`确认批量删除选中的 ${deletedBooks.length} 本书籍吗？`)) {
      const deletedIds = deletedBooks.map(b => b.id);
      const urls = deletedBooks.flatMap(b => [b.fileUrl, b.cover]);
      const freedBytes = deletedBooks.reduce((sum, b) => sum + (Number(b.fileSize) || 0), 0);
      const removedUserItemIds = currentUser?.role === 'admin'
        ? deletedBooks.filter(b => b.ownerId && b.ownerId !== currentUser.id).map(b => b.id)
        : [];
      setBooks(prev => prev.filter(b => !deletedIds.includes(b.id)));
      setSelectedIds([]);
      if (readingBook && deletedIds.includes(readingBook.id)) setReadingBook(null);
      void deleteUploadedFiles(urls, {
        exclude: { bookIds: deletedIds },
        freedBytes,
        removedUserItemIds,
      });
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) return;
    const exportBooks = books.filter(b => selectedIds.includes(b.id));
    startMultiTransfer('download', exportBooks.length, exportBooks[0]?.title || '');

    const zip = new JSZip();
    for (let i = 0; i < exportBooks.length; i++) {
      const book = exportBooks[i];
      const ext = (book.format || 'txt').toLowerCase();
      const filename = bookOriginalFilename(book);
      updateMultiTransferProgress(i + 1, book.title, Math.round(((i + 0.5) / exportBooks.length) * 90));

      try {
        let fileData: Blob | string = book.fileUrl;
        if (book.fileUrl && book.fileUrl.startsWith('idb_file_')) {
          const stored = await getFileFromIndexedDB(book.fileUrl);
          if (stored) fileData = stored;
        }

        if (fileData instanceof Blob) {
          zip.file(filename, fileData);
        } else if (typeof fileData === 'string' && (fileData.startsWith('data:') || fileData.startsWith('http'))) {
          const res = await fetch(fileData);
          const b = await res.blob();
          zip.file(filename, b);
        } else {
          zip.file(filename, book.content || `fox3 电子书: ${book.title}`);
        }
      } catch {
        zip.file(filename, book.content || `fox3 电子书: ${book.title}`);
      }
      updateMultiTransferProgress(i + 1, book.title, Math.round(((i + 1) / exportBooks.length) * 95));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    finishMultiTransfer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `fox3_books_batch_${Date.now()}.zip`;
    link.click();
  };

  const handleDeleteBook = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = books.find(b => b.id === id);
    if (!target || !canManageBook(target)) return;
    if (window.confirm('确认下架并删除该书籍吗？')) {
      const removedUserItemIds = currentUser?.role === 'admin' && target.ownerId && target.ownerId !== currentUser.id
        ? [target.id]
        : [];
      setBooks(prev => prev.filter(b => b.id !== id));
      if (readingBook?.id === id) setReadingBook(null);
      void deleteUploadedFiles([target.fileUrl, target.cover], {
        exclude: { bookIds: [id] },
        freedBytes: Number(target.fileSize) || undefined,
        removedUserItemIds,
      });
    }
  };

  const handleRenameBook = (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentOriginal = bookOriginalFilename(book);
    const nextName = window.prompt('设置书架显示文件名（不会重命名底层云存储对象）：', currentOriginal)?.trim();
    if (!nextName) return;
    const origExtMatch = currentOriginal.match(/(\.[a-z0-9]{1,8})$/i);
    const fallbackExtension = origExtMatch ? origExtMatch[1].toLowerCase() : `.${String(book.format || 'txt').toLowerCase()}`;
    const displayFilename = /\.[a-z0-9]{1,8}$/i.test(nextName) ? nextName : `${nextName}${fallbackExtension}`;
    setBooks(previous => previous.map(item => item.id === book.id && canManageBook(item) ? { ...item, displayFilename, title: displayFilename, updatedAt: Date.now() } : item));
  };

  const handleDownload = async (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    const originalFilename = bookOriginalFilename(book);
    startTransfer('download', originalFilename);
    let p = 25;
    const interval = setInterval(() => {
      p += 35;
      if (p >= 90) clearInterval(interval);
      else updateTransferPercent(p);
    }, 100);

    try {
      let downloadUrl = book.fileUrl;
      // If fileUrl is not available or is an empty/blob URL that expired, synthesize from IndexedDB or content
      if (!downloadUrl || downloadUrl === '#' || downloadUrl === '') {
        const blob = new Blob([book.content || ''], { type: 'text/plain;charset=utf-8' });
        downloadUrl = URL.createObjectURL(blob);
      }

      // If it points to an indexedDB key in fileUrl, attempt extraction
      if (book.fileUrl && book.fileUrl.startsWith('idb_file_')) {
        const storedBlob = await getFileFromIndexedDB(book.fileUrl);
        if (storedBlob instanceof Blob) {
          downloadUrl = URL.createObjectURL(storedBlob);
        } else if (typeof storedBlob === 'string') {
          downloadUrl = storedBlob;
        }
      }

      clearInterval(interval);
      finishTransfer();

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = originalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      clearInterval(interval);
      finishTransfer();
      const blob = new Blob([book.content || ''], { type: 'text/plain;charset=utf-8' });
      const fallbackUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = fallbackUrl;
      link.download = originalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Full Screen Mobile / Desktop Reader Modal
  if (readingBook) {
    return (
      <div
        className={`fixed inset-0 z-50 bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 flex flex-col transition-all duration-300 ${
          isFullScreen ? 'p-0' : 'p-2 sm:p-6 md:p-10'
        }`}
      >
        <div className="flex-1 bg-white dark:bg-stone-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-stone-200 dark:border-stone-800">
          {/* Reader Top Bar - with mobile safe area support */}
          <div className="safe-top px-4 py-3 bg-white/95 dark:bg-stone-900/95 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setReadingBook(null)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate max-w-xs sm:max-w-md font-serif-sc">
                  {bookOriginalFilename(readingBook)}
                </h3>
                <span className="text-[10px] text-sky-500 font-medium uppercase tracking-wider">
                  [{readingBook.format}] • {readingBook.author}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Download book file button */}
              <button
                onClick={e => handleDownload(readingBook, e)}
                title="下载书籍原文件"
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-600 dark:text-stone-300"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">下载</span>
              </button>

              {/* Font Sizer */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-1 text-xs">
                <button
                  onClick={() => setFontSize(Math.max(14, fontSize - 2))}
                  className="px-2 py-0.5 rounded hover:bg-white dark:hover:bg-stone-700"
                >
                  A-
                </button>
                <span className="px-1 text-[11px] font-mono">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(Math.min(28, fontSize + 2))}
                  className="px-2 py-0.5 rounded hover:bg-white dark:hover:bg-stone-700"
                >
                  A+
                </button>
              </div>

              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? '退出全屏' : '全屏沉浸阅读'}
                className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition"
              >
                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Reader Scrollable Content / PDF viewer / Direct Document Reader */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-12 max-w-4xl mx-auto w-full h-full flex flex-col">
            {loadingRemoteText && <div className="mb-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 p-3 text-sm text-sky-700 dark:text-sky-300">正在从云端读取电子书正文…</div>}
            {remoteTextError && <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-300">{remoteTextError}</div>}
            {readingBook.format === 'PDF' && readingBook.fileUrl ? (
              <div className="w-full h-full flex-1 min-h-[550px] flex flex-col rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-white">
                <iframe
                  src={`${readingBook.fileUrl}#toolbar=1`}
                  title={readingBook.title}
                  className="w-full flex-1 min-h-[550px] border-0"
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header info card */}
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-sky-500" />
                    <span>正文格式: {readingBook.format}</span>
                    <span>•</span>
                    <span>总字符数: {(readingBook.content || '').length} 字</span>
                  </div>
                  <span>支持移动端自适应全屏阅览</span>
                </div>

                {/* Formatted Text Content */}
                <div
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
                  className="font-serif-sc text-stone-800 dark:text-stone-200 select-text whitespace-pre-wrap leading-relaxed py-2 font-normal"
                >
                  {readingBook.content ||
                    `${bookOriginalFilename(readingBook)}\n\n该书籍/文档文件格式为 [${readingBook.format}]，已就绪可供在线阅览。无论在手机端或电脑端均支持全屏沉浸式无干扰阅读体验。`}
                </div>
              </div>
            )}
          </div>

          {/* Reader Bottom Bar */}
          <div className="safe-bottom px-6 py-2 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
            <span>格式: {readingBook.format} • {(readingBook.fileSize / 1024 / 1024).toFixed(2)} MB</span>
            <span>已读进度: {readingBook.progress || 25}%</span>
          </div>
        </div>
      </div>
    );
  }

  // Get layout grid class
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
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5';
      case 'small':
        return 'space-y-3';
      case 'original':
      default:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className={`p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div>
          <h2 className="text-xl font-bold font-serif-sc text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-sky-500" />
            <span>云端书架 (支持 EPUB / PDF / TXT / MOBI / AZW3)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            支持多格式电子书在线章节阅读、手机沉浸全屏阅读、原书下载与本地高可用
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('books', 'big')}
              title="大图封面"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'big' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('books', 'medium')}
              title="中图网格"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'medium' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('books', 'small')}
              title="小图详情列表"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'small' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('books', 'original')}
              title="原布局"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'original' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {canUploadBooks && (
            <button
              onClick={() => setIsUploading(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>上传电子书</span>
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
              {selectedIds.length === books.length && books.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-sky-500" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>全选 ({selectedIds.length}/{books.length})</span>
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

      {/* Bookshelf Grid View */}
      <div className={getLayoutClass()}>
        {books.map(book => {
          const isSelected = selectedIds.includes(book.id);

          // Small Detail List View
          if (currentViewMode === 'small') {
            return (
              <div
                key={book.id}
                onClick={() => setReadingBook(book)}
                className={`p-3 sm:p-4 rounded-2xl border shadow-sm flex items-center justify-between gap-4 cursor-pointer transition hover:shadow-md ${
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
                      onClick={e => handleToggleSelect(book.id, e)}
                      className="p-1 text-slate-400 hover:text-sky-500 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0">
                    <SafeImage src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
                        {book.format}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {bookOriginalFilename(book)}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{book.author}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5" title={bookOriginalFilename(book)}>{bookOriginalFilename(book)} · {formatFileSize(book.fileSize)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={e => handleDownload(book, e)}
                    className="p-2 text-slate-400 hover:text-sky-500"
                    title="下载书籍"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {canManageBook(book) && <button onClick={e => handleRenameBook(book, e)} className="p-2 text-slate-400 hover:text-sky-500" title="重命名电子书显示文件名"><Pencil className="w-4 h-4" /></button>}
                  {canManageBook(book) && (
                    <button
                      onClick={e => handleDeleteBook(book.id, e)}
                      className="p-2 text-slate-400 hover:text-rose-500"
                      title="删除书籍"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <span className="text-xs text-sky-500 font-medium hidden sm:inline">在线阅读</span>
                </div>
              </div>
            );
          }

          // Card View
          return (
            <div
              key={book.id}
              onClick={() => setReadingBook(book)}
              className={`group cursor-pointer rounded-2xl overflow-hidden border shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between ${
                isSelected ? 'ring-2 ring-sky-500' : ''
              } ${
                systemSettings.transparentCards
                  ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                <SafeImage
                  src={book.cover}
                  alt={book.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold rounded">
                  {book.format}
                </span>

                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    onClick={e => handleDownload(book, e)}
                    className="p-1 bg-black/60 hover:bg-sky-600 text-white rounded transition"
                    title="下载电子书文件"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {canManageBook(book) && <button onClick={e => handleRenameBook(book, e)} className="rounded bg-black/60 p-1 text-white transition hover:bg-sky-600" title="重命名电子书显示文件名"><Pencil className="h-3.5 w-3.5" /></button>}

                  {canManageBook(book) && (
                    <button
                      onClick={e => handleDeleteBook(book.id, e)}
                      className="p-1 bg-black/60 hover:bg-rose-600 text-white rounded transition"
                      title="删除书籍"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3">
                <h4 className="text-xs font-bold font-serif-sc text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-500 transition">
                  {bookOriginalFilename(book)}
                </h4>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{book.author}</p>

                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span title={`${bookOriginalFilename(book)} · ${formatFileSize(book.fileSize)}`}>{bookOriginalFilename(book)} · {formatFileSize(book.fileSize)}</span>
                  <span className="text-sky-500 font-medium">开始阅读</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Book Modal */}
      {isUploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold font-serif-sc text-slate-900 dark:text-slate-100 mb-4">
              上传并添加多格式电子书
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              支持 EPUB, PDF, TXT, MOBI, AZW3 等电子书格式。文件自动同步至 Cloudflare R2 / 本地安全库。
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-sky-300 dark:border-sky-900/60 rounded-2xl p-8 text-center cursor-pointer hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition flex flex-col items-center justify-center gap-2"
            >
              <Upload className="w-8 h-8 text-sky-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                点击选择电子书文件
              </span>
              <span className="text-[10px] text-slate-400">
                .epub, .pdf, .txt, .mobi, .azw3
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleBookFileUpload}
              accept=".epub,.pdf,.txt,.mobi,.azw3,.md,.json,.doc,.docx"
              className="hidden"
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setIsUploading(false)}
                className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
