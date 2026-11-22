import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Post, ViewMode } from '../../types';
import { SafeImage } from '../common/SafeImage';
import {
  Search,
  Tag,
  Clock,
  Eye,
  Heart,
  Bookmark,
  PlusCircle,
  Edit3,
  Trash2,
  ChevronRight,
  ArrowLeft,
  LayoutGrid,
  Grid3X3,
  List,
  Columns,
  CheckSquare,
  Square,
  Download,
  Upload,
  Image as ImageIcon,
  Check,
  X,
} from 'lucide-react';

/**
 * Renders Markdown-like text into React elements, supporting:
 * - Markdown images: ![alt](url) -> rendered as responsive <img> with captions
 * - Headings: #, ##, ###
 * - Blockquotes: > quote
 * - Unordered lists: - item, * item
 * - Standard paragraphs with bolding (**text**)
 */
const renderMarkdownContent = (content: string) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join('\n').trim();
    paragraphBuffer = [];
    if (!text) return;

    elements.push(
      <p key={key} className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans whitespace-pre-line">
        {renderInlineFormatting(text)}
      </p>
    );
  };

  const renderInlineFormatting = (text: string) => {
    const parts = text.split(/(\**.*?\**)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushParagraph(`para-${index}`);
      const alt = imgMatch[1] || 'Blog illustration';
      const src = imgMatch[2];
      elements.push(
        <figure key={`img-${index}`} className="my-6 space-y-2">
          <div className="rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-sm max-h-[520px] bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <SafeImage
              src={src}
              alt={alt}
              className="w-full h-auto max-h-[520px] object-contain hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
          {alt && (
            <figcaption className="text-center text-xs text-slate-500 dark:text-slate-400 italic">
              {alt}
            </figcaption>
          )}
        </figure>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph(`para-${index}`);
      elements.push(
        <h3 key={`h3-${index}`} className="text-lg md:text-xl font-bold font-serif-sc text-slate-900 dark:text-slate-100 mt-6 mb-2">
          {trimmed.slice(4)}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushParagraph(`para-${index}`);
      elements.push(
        <h2 key={`h2-${index}`} className="text-xl md:text-2xl font-bold font-serif-sc text-slate-900 dark:text-slate-100 mt-8 mb-3 border-b pb-2 border-slate-200 dark:border-slate-800">
          {trimmed.slice(3)}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushParagraph(`para-${index}`);
      elements.push(
        <h1 key={`h1-${index}`} className="text-2xl md:text-3xl font-bold font-serif-sc text-slate-900 dark:text-slate-100 mt-8 mb-4">
          {trimmed.slice(2)}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph(`para-${index}`);
      elements.push(
        <blockquote key={`quote-${index}`} className="border-l-4 border-sky-500 pl-4 py-1 my-3 text-slate-600 dark:text-slate-400 italic bg-sky-50/50 dark:bg-sky-950/20 rounded-r-xl">
          {trimmed.slice(2)}
        </blockquote>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph(`para-${index}`);
      elements.push(
        <div key={`li-${index}`} className="flex items-start gap-2 ml-4 my-1 text-slate-700 dark:text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-2 shrink-0" />
          <span>{renderInlineFormatting(trimmed.slice(2))}</span>
        </div>
      );
      return;
    }

    if (!trimmed) {
      flushParagraph(`para-${index}`);
      return;
    }

    paragraphBuffer.push(line);
  });

  flushParagraph('para-final');
  return elements;
};


const extractPostMediaUrls = (post?: Partial<Post> | null): string[] => {
  if (!post) return [];
  const urls: string[] = [];
  if (post.cover) urls.push(post.cover);
  const content = post.content || '';
  for (const match of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    if (match[1]) urls.push(match[1].trim());
  }
  return Array.from(new Set(urls.filter(Boolean)));
};

export const BlogSection: React.FC = () => {
  const { posts, setPosts, photos, currentUser, uploadFile, deleteUploadedFiles, viewModes, setViewMode, systemSettings, deviceMode } = useApp();
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activePost, setActivePost] = useState<Post | null>(null);

  // Batch selections
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const currentViewMode: ViewMode = viewModes['blog'] || 'original';

  // Editor modal state
  const [isEditing, setIsEditing] = useState(false);
  const [editingPost, setEditingPost] = useState<Partial<Post>>({
    title: '',
    summary: '',
    content: '',
    category: '技术架构',
    tags: ['fox3'],
    cover: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
    author: currentUser?.username || 'fox',
  });

  const categories = ['all', ...Array.from(new Set(posts.map(p => p.category)))];

  const filteredPosts = posts.filter(post => {
    const matchesCat = selectedCategory === 'all' || post.category === selectedCategory;
    const matchesQuery =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesQuery && !post.deleted;
  });

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredPosts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPosts.map(p => p.id));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`确认批量删除选中的 ${selectedIds.length} 篇文章吗？`)) {
      const deletedPosts = posts.filter(p => selectedIds.includes(p.id) && canDeletePost(p));
      const deletedIds = deletedPosts.map(p => p.id);
      const urlsToDelete = Array.from(new Set(deletedPosts.flatMap(p => extractPostMediaUrls(p))));
      setPosts(prev => prev.filter(p => !deletedIds.includes(p.id)));
      setSelectedIds([]);
      if (urlsToDelete.length > 0) {
        void deleteUploadedFiles(urlsToDelete, { exclude: { postIds: deletedIds } });
      }
    }
  };

  const handleBatchDownload = () => {
    if (selectedIds.length === 0) return;
    const exportPosts = posts.filter(p => selectedIds.includes(p.id));
    const blob = new Blob([JSON.stringify(exportPosts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fox3_posts_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setPosts(prev => [...imported, ...prev]);
          alert(`成功批量导入 ${imported.length} 篇文章！`);
        }
      } catch {
        alert('导入的 JSON 格式不符合规范！');
      }
    };
    reader.readAsText(file);
  };

  const handleLike = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPosts(prev =>
      prev.map(p => (p.id === id ? { ...p, likes: p.likes + 1 } : p))
    );
    if (activePost && activePost.id === id) {
      setActivePost(prev => (prev ? { ...prev, likes: prev.likes + 1 } : null));
    }
  };

  const handleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPosts(prev =>
      prev.map(p => (p.id === id ? { ...p, isBookmarked: !p.isBookmarked } : p))
    );
    if (activePost && activePost.id === id) {
      setActivePost(prev => (prev ? { ...prev, isBookmarked: !prev.isBookmarked } : null));
    }
  };

  const canDeletePost = (post: Post) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return post.author === currentUser.username;
  };

  const canEditPost = (post: Post) => {
    if (!currentUser) return false;
    // Requirements: Registered users cannot edit any posts (even their own). Only admin can edit posts.
    if (currentUser.role === 'admin') return true;
    return false;
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const postToDelete = posts.find(p => p.id === id);
    if (!postToDelete) return;
    if (!canDeletePost(postToDelete)) {
      alert('权限不足：注册用户仅能删除自己发布的博文！');
      return;
    }
    if (window.confirm('确认删除这篇文章吗？')) {
      const urlsToDelete = extractPostMediaUrls(postToDelete);
      setPosts(prev => prev.filter(p => p.id !== id));
      if (activePost?.id === id) setActivePost(null);
      if (urlsToDelete.length > 0) {
        void deleteUploadedFiles(urlsToDelete, { exclude: { postIds: [id] } });
      }
    }
  };

  const handleSavePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost.title || !editingPost.content) return;

    if (editingPost.id) {
      const oldPost = posts.find(p => p.id === editingPost.id);
      const newUrls = new Set(extractPostMediaUrls(editingPost));
      const removedUrls = extractPostMediaUrls(oldPost).filter(url => !newUrls.has(url));
      setPosts(prev =>
        prev.map(p =>
          p.id === editingPost.id
            ? ({
                ...p,
                ...editingPost,
                updatedAt: Date.now(),
              } as Post)
            : p
        )
      );
      if (activePost?.id === editingPost.id) {
        setActivePost({ ...activePost, ...editingPost } as Post);
      }
      if (removedUrls.length > 0) {
        void deleteUploadedFiles(removedUrls, { exclude: { postIds: [editingPost.id] } });
      }
    } else {
      const newP: Post = {
        id: `post-${Date.now()}`,
        title: editingPost.title || '无标题文章',
        summary: editingPost.summary || editingPost.content.substring(0, 120),
        content: editingPost.content,
        category: editingPost.category || '默认分类',
        tags: editingPost.tags || ['fox3'],
        cover:
          editingPost.cover ||
          'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
        author: currentUser?.username || 'fox',
        views: 1,
        likes: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPosts(prev => [newP, ...prev]);
    }
    setIsEditing(false);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFile(file);
    setEditingPost(prev => ({ ...prev, cover: res.url }));
  };

  // Full Post Reading View
  if (activePost) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <button
          onClick={() => setActivePost(null)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回博文列表</span>
        </button>

        <article className={`p-6 md:p-10 rounded-3xl border shadow-sm ${
          systemSettings.transparentCards
            ? 'bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border-white/20'
            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
        }`}>
          <div className="space-y-4 mb-8 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 rounded-full text-xs font-semibold">
                {activePost.category}
              </span>
              {activePost.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <h1 className="text-2xl md:text-4xl font-bold font-serif-sc text-slate-900 dark:text-slate-100 leading-tight">
              {activePost.title}
            </h1>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <div className="flex items-center gap-4">
                <span>
                  作者: {activePost.author}{' '}
                  {activePost.author === 'fox' || activePost.author === (currentUser?.role === 'admin' ? currentUser.username : 'fox') ? (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-500 border border-rose-200 dark:border-rose-900/50">
                      管理员
                    </span>
                  ) : (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-sky-50 dark:bg-sky-950/40 text-sky-500 border border-sky-200 dark:border-sky-900/50">
                      注册用户
                    </span>
                  )}
                </span>
                <span>
                  发布于:{' '}
                  {new Date(activePost.createdAt).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {activePost.views} 次浏览
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={e => handleLike(activePost.id, e)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                >
                  <Heart className="w-3.5 h-3.5 fill-current" />
                  <span>{activePost.likes}</span>
                </button>
                <button
                  onClick={e => handleBookmark(activePost.id, e)}
                  className={`p-1.5 rounded-lg border transition ${
                    activePost.isBookmarked
                      ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${activePost.isBookmarked ? 'fill-amber-500' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="w-full h-72 md:h-96 rounded-2xl overflow-hidden mb-8 shadow-sm">
            <SafeImage
              src={activePost.cover}
              alt={activePost.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed font-sans space-y-4">
            {renderMarkdownContent(activePost.content)}
          </div>
        </article>
      </div>
    );
  }

  // Determine grid container class based on view mode and deviceMode
  const getLayoutClass = () => {
    if (deviceMode === 'mobile') {
      switch (currentViewMode) {
        case 'small':
          return 'space-y-3';
        case 'big':
          return 'grid grid-cols-1 gap-6';
        case 'medium':
        case 'original':
        default:
          return 'grid grid-cols-1 gap-5';
      }
    }

    switch (currentViewMode) {
      case 'big':
        return 'grid grid-cols-1 gap-8';
      case 'medium':
        return 'grid grid-cols-1 md:grid-cols-2 gap-6';
      case 'small':
        return 'space-y-3';
      case 'original':
      default:
        return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search, Filter Bar and View Mode Switcher */}
      <div className={`p-4 rounded-3xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 ${
        systemSettings.transparentCards
          ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
      }`}>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索文章、标签或关键词..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat === 'all' ? '全部专栏' : cat}
            </button>
          ))}
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('blog', 'big')}
              title="大图模式"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'big' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('blog', 'medium')}
              title="中图网格"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'medium' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('blog', 'small')}
              title="小图详情列表"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'small' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('blog', 'original')}
              title="原三列布局"
              className={`p-1.5 rounded-lg transition ${currentViewMode === 'original' ? 'bg-white dark:bg-slate-700 text-sky-500 shadow-xs' : 'text-slate-400'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {currentUser && (
            <button
              onClick={() => {
                setEditingPost({
                  title: '',
                  summary: '',
                  content: '',
                  category: '生活随想',
                  tags: ['fox3'],
                  cover: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
                  author: currentUser.username,
                });
                setIsEditing(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-md transition whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{currentUser.role === 'admin' ? '写新博文' : '发布我的博文'}</span>
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
              {selectedIds.length === filteredPosts.length && filteredPosts.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-sky-500" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>全选 ({selectedIds.length}/{filteredPosts.length})</span>
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
                  <span>批量导出所选</span>
                </button>
              </>
            )}
          </div>

          <label className="flex items-center gap-1 text-slate-500 hover:text-sky-500 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>批量导入博文 (JSON)</span>
            <input type="file" accept=".json" onChange={handleBatchUploadJson} className="hidden" />
          </label>
        </div>
      )}

      {/* Posts List rendering with active ViewMode */}
      <div className={getLayoutClass()}>
        {filteredPosts.map(post => {
          const isSelected = selectedIds.includes(post.id);

          // Small Detail List Layout
          if (currentViewMode === 'small') {
            return (
              <div
                key={post.id}
                onClick={() => {
                  setPosts(prev =>
                    prev.map(p => (p.id === post.id ? { ...p, views: p.views + 1 } : p))
                  );
                  setActivePost({ ...post, views: post.views + 1 });
                }}
                className={`group p-3 sm:p-4 rounded-2xl border shadow-sm flex items-center justify-between gap-4 cursor-pointer transition hover:shadow-md ${
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
                      onClick={e => handleToggleSelect(post.id, e)}
                      className="p-1 text-slate-400 hover:text-sky-500 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0">
                    <SafeImage src={post.cover} alt={post.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
                        {post.category}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-500 transition">
                        {post.title}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{post.summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-xs text-slate-400">
                  <span className="hidden sm:inline font-mono">{new Date(post.createdAt).toLocaleDateString()}</span>
                  <button
                    onClick={e => handleBookmark(post.id, e)}
                    className="p-1 hover:text-amber-500"
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${post.isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          }

          // Big, Medium, or Original Card Layout
          return (
            <div
              key={post.id}
              onClick={() => {
                setPosts(prev =>
                  prev.map(p => (p.id === post.id ? { ...p, views: p.views + 1 } : p))
                );
                setActivePost({ ...post, views: post.views + 1 });
              }}
              className={`group cursor-pointer rounded-3xl overflow-hidden border shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between ${
                isSelected ? 'ring-2 ring-sky-500' : ''
              } ${
                systemSettings.transparentCards
                  ? 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-white/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <div>
                <div className={`relative w-full overflow-hidden ${currentViewMode === 'big' ? 'h-72 sm:h-96' : 'h-48'}`}>
                  <SafeImage
                    src={post.cover}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-medium rounded-lg">
                    {post.category}
                  </span>

                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={e => handleToggleSelect(post.id, e)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white hover:text-sky-400"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(post.createdAt).toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span>•</span>
                    <span>{post.author}</span>
                    {post.author === 'fox' ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-500 font-medium border border-rose-200/50">
                        管理员
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-50 dark:bg-sky-950/40 text-sky-500 font-medium border border-sky-200/50">
                        注册用户
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold font-serif-sc text-slate-800 dark:text-slate-100 group-hover:text-sky-500 transition line-clamp-2">
                    {post.title}
                  </h3>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {post.summary}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {post.views}
                  </span>
                  <button
                    onClick={e => handleLike(post.id, e)}
                    className="flex items-center gap-1 hover:text-rose-500 transition"
                  >
                    <Heart className="w-3.5 h-3.5" />
                    {post.likes}
                  </button>
                  <button
                    onClick={e => handleBookmark(post.id, e)}
                    className={`hover:text-amber-500 transition ${post.isBookmarked ? 'text-amber-500' : ''}`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${post.isBookmarked ? 'fill-amber-500' : ''}`} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {canEditPost(post) && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setEditingPost(post);
                        setIsEditing(true);
                      }}
                      title="编辑文章"
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-sky-500"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canDeletePost(post) && (
                    <button
                      onClick={e => handleDelete(post.id, e)}
                      title="删除文章"
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-500 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="text-sky-500 font-medium group-hover:translate-x-1 transition-transform inline-flex items-center">
                    阅读 <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Article Editor Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold font-serif-sc text-slate-900 dark:text-slate-100">
                {editingPost.id ? '编辑博文' : '撰写全新博文'}
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <span className="text-slate-400">当前发布者:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {currentUser?.username}
                </span>
                {currentUser?.role === 'admin' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500 text-white font-medium">
                    管理员
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500 text-white font-medium">
                    注册用户
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSavePost} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  文章标题
                </label>
                <input
                  type="text"
                  value={editingPost.title || ''}
                  onChange={e => setEditingPost({ ...editingPost, title: e.target.value })}
                  placeholder="例如：fox3 部署指南与性能调优"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    所属分类
                  </label>
                  <input
                    type="text"
                    value={editingPost.category || ''}
                    onChange={e => setEditingPost({ ...editingPost, category: e.target.value })}
                    placeholder="技术架构 / 部署指南 / 随想"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    标签 (逗号隔开)
                  </label>
                  <input
                    type="text"
                    value={editingPost.tags?.join(', ') || ''}
                    onChange={e =>
                      setEditingPost({
                        ...editingPost,
                        tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Cloudflare, D1, R2"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  文章封面图片
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                    <SafeImage
                      src={editingPost.cover || ''}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <label className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl cursor-pointer transition">
                    上传本地封面
                    <input
                      type="file"
                      onChange={handleCoverUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    value={editingPost.cover || ''}
                    onChange={e => setEditingPost({ ...editingPost, cover: e.target.value })}
                    placeholder="或粘贴图片 URL"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  简明概要
                </label>
                <input
                  type="text"
                  value={editingPost.summary || ''}
                  onChange={e => setEditingPost({ ...editingPost, summary: e.target.value })}
                  placeholder="展示在列表中的核心一句话概括"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Blog Content Image Insertion Controls (Distinct from Cover Image) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    正文内容配图 (与封面图区分，插入正文任意位置)
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Upload local image into content */}
                    <label className="flex items-center gap-1 px-2.5 py-1 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 hover:bg-sky-100 text-[11px] font-medium rounded-lg cursor-pointer transition border border-sky-200/50">
                      <Upload className="w-3 h-3" />
                      <span>上传本地配图</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const res = await uploadFile(file);
                          const markdownImg = `\n\n![${file.name.replace(/\.[^/.]+$/, '')}](${res.url})\n\n`;
                          setEditingPost(prev => ({
                            ...prev,
                            content: (prev.content || '') + markdownImg
                          }));
                        }}
                      />
                    </label>

                    {/* Pick from existing album / gallery */}
                    <button
                      type="button"
                      onClick={() => setShowGalleryPicker(true)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium rounded-lg transition"
                    >
                      <ImageIcon className="w-3 h-3 text-sky-500" />
                      <span>从相册选择配图</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={editingPost.content || ''}
                  onChange={e => setEditingPost({ ...editingPost, content: e.target.value })}
                  placeholder="在这里输入文章 Markdown 格式正文...\n可以使用上方“上传本地配图”或“从相册选择配图”将图片插入到正文中作为段落配图！"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              {/* Gallery Image Picker Modal */}
              {showGalleryPicker && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-sky-500" />
                      选择相册图片插入博文正文配图
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowGalleryPicker(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1">
                    {photos.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          const markdownImg = `\n\n![${p.title}](${p.url})\n\n`;
                          setEditingPost(prev => ({
                            ...prev,
                            content: (prev.content || '') + markdownImg
                          }));
                          setShowGalleryPicker(false);
                        }}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:ring-2 hover:ring-sky-500 transition"
                      >
                        <SafeImage src={p.url} alt={p.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-xl shadow-md transition"
                >
                  保存文章
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
