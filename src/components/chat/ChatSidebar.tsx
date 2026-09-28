/**
 * Chat Sidebar Component - Phase 50 + 129.2
 * Displays chat history and allows switching between conversations.
 *
 * @file ChatSidebar.tsx
 * @status ACTIVE
 * @phase Phase 50 - Chat History + Sidebar UI
 * @lastUpdate 2026-02-10
 *
 * Features:
 * - Load and display all chats with pagination
 * - Search/filter chats by file name
 * - Select chat to load message history
 * - Show message count and last updated timestamp
 * - Delete chat (optional)
 *
 * MARKER_129.2A: Pagination with offset/limit (already implemented)
 * MARKER_129.2B: Loading skeleton animation
 * MARKER_129.2C: Scroll-to-load-more with IntersectionObserver
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ChatSidebar.css';

interface Chat {
  id: string;
  file_name: string;
  file_path: string;
  display_name?: string;  // Phase 74: Custom chat name
  context_type?: string;  // Phase 74: "file" | "folder" | "group" | "topic"
  chat_kind?: 'solo' | 'team'; // MARKER_137.4L: Explicit UX kind
  items?: string[];       // Phase 74: File paths for groups
  topic?: string;         // Phase 74: Topic for file-less chats
  is_favorite?: boolean;  // MARKER_137.3: Favorite chat pin
  created_at: string;
  updated_at: string;
  message_count?: number;
  // TODO_CAM_INDICATOR: Add CAM activation field here (hot/warm/cold status from /api/cam/activation?chat_id=...)
  cam_activation?: 'hot' | 'warm' | 'cold';  // Show memory priority in sidebar
}

interface ChatSidebarProps {
  isOpen: boolean;
  onSelectChat: (chatId: string, filePath: string, fileName: string) => void;
  currentChatId?: string;
  onClose?: () => void;
}

/**
 * MARKER_129.2B: Loading skeleton for chat items
 */
const ChatSkeleton = () => (
  <div className="chat-sidebar-skeleton">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="chat-skeleton-item">
        <div className="chat-skeleton-icon" />
        <div className="chat-skeleton-content">
          <div className="chat-skeleton-title" />
          <div className="chat-skeleton-meta" />
        </div>
      </div>
    ))}
  </div>
);

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen,
  onSelectChat,
  currentChatId,
  onClose
}) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searchMatchedChatIds, setSearchMatchedChatIds] = useState<string[] | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const LIMIT = 50;

  // MARKER_129.2C: IntersectionObserver for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mergeChatsById = useCallback((base: Chat[], incoming: Chat[]): Chat[] => {
    const map = new Map<string, Chat>();
    base.forEach(c => map.set(c.id, c));
    incoming.forEach(c => {
      const prev = map.get(c.id);
      map.set(c.id, { ...(prev || {}), ...c });
    });
    return Array.from(map.values());
  }, []);

  // Load chats on component mount (auto-load on app startup)
  useEffect(() => {
    loadChats(true);
  }, []);

  // Reload chats when sidebar opens (refresh on visibility)
  useEffect(() => {
    if (isOpen) {
      loadChats(true);
    }
  }, [isOpen]);

  // MARKER_RENAME_FIX: Listen for external rename events
  // MARKER_RENAME_DEBUG_FIX: Added debugging for sidebar event listener
  useEffect(() => {
    const handleChatRenamed = (e: Event) => {
      const { chatId, newName } = (e as CustomEvent).detail;
      console.log('[SIDEBAR DEBUG 1] Received chat-renamed event:', { chatId, newName });
      console.log('[SIDEBAR DEBUG 2] Current chats before update:', chats.map(c => ({ id: c.id, name: c.display_name })));

      setChats(prevChats => {
        const updated = prevChats.map(c =>
          c.id === chatId ? { ...c, display_name: newName } : c
        );
        console.log('[SIDEBAR DEBUG 3] Updated chats:', updated.map(c => ({ id: c.id, name: c.display_name })));
        return updated;
      });
    };

    console.log('[SIDEBAR DEBUG 0] Setting up chat-renamed event listener');
    window.addEventListener('chat-renamed', handleChatRenamed);
    return () => {
      console.log('[SIDEBAR DEBUG 0] Cleaning up chat-renamed event listener');
      window.removeEventListener('chat-renamed', handleChatRenamed);
    };
  }, [chats]);

  // Keep sidebar history fresh when a new draft chat is created from ChatPanel.
  useEffect(() => {
    const handleChatCreated = () => {
      void loadChats(true);
    };
    window.addEventListener('chat-created', handleChatCreated);
    return () => window.removeEventListener('chat-created', handleChatCreated);
  }, [isOpen]);

  const loadChats = async (reset: boolean = false) => {
    if (reset) {
      setLoading(true);
      setOffset(0);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentOffset = reset ? 0 : offset;
      const response = await fetch(`/api/chats?limit=${LIMIT}&offset=${currentOffset}`);
      if (response.ok) {
        const data = await response.json();

        const incoming = (data.chats || []) as Chat[];
        if (reset) {
          setChats(mergeChatsById([], incoming));
        } else {
          setChats(prev => mergeChatsById(prev, incoming));
        }

        setTotal(data.total || 0);
        setHasMore(data.has_more || false);
        setOffset(currentOffset + (data.chats?.length || 0));

        // console.log(`[ChatSidebar] Loaded ${data.chats?.length || 0} chats (total: ${data.total})`);
      } else {
        console.error(`[ChatSidebar] Error loading chats: ${response.status}`);
      }
    } catch (error) {
      console.error('[ChatSidebar] Error fetching chats:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // MARKER_137.4D: Search chat history by message content via existing backend endpoint.
  useEffect(() => {
    const query = search.trim();

    if (!query) {
      setSearchMatchedChatIds(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/chats/search/${encodeURIComponent(query)}`);
        if (!response.ok) {
          setSearchMatchedChatIds([]);
          return;
        }

        const data = await response.json();
        const matchedChats: Chat[] = data.chats || [];
        const ids = matchedChats.map(c => c.id);
        setSearchMatchedChatIds(ids);
        if (matchedChats.length > 0) {
          setChats(prev => mergeChatsById(prev, matchedChats));
        }
      } catch {
        setSearchMatchedChatIds([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [search, mergeChatsById]);

  // MARKER_129.2C: Wrapped in useCallback for IntersectionObserver
  const loadMoreChats = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadChats(false);
    }
  }, [loadingMore, hasMore]);

  // MARKER_129.2C: IntersectionObserver for scroll-to-load-more
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          loadMoreChats();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMoreChats]);

  const filteredChats = chats.filter(chat => {
    const query = search.trim();
    if (!query) return true;

    const needle = search.toLowerCase();
    const byFile = chat.file_name.toLowerCase().includes(needle);
    const byDisplay = (chat.display_name || '').toLowerCase().includes(needle);

    // Prefer backend message-aware search when available, keep local fallback by title.
    if (searchMatchedChatIds) {
      const matched = searchMatchedChatIds.includes(chat.id);
      return matched || byFile || byDisplay;
    }
    return byFile || byDisplay;
  });

  const sortedChats = [...filteredChats].sort((a, b) => {
    const selectedA = currentChatId === a.id ? 1 : 0;
    const selectedB = currentChatId === b.id ? 1 : 0;
    if (selectedA !== selectedB) return selectedB - selectedA;

    const favA = a.is_favorite ? 1 : 0;
    const favB = b.is_favorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    return (b.updated_at || '').localeCompare(a.updated_at || '');
  });

  // MARKER_137.4I: Conservative dedup for legacy split history display.
  const dedupedChats = sortedChats.filter((chat, idx, arr) => {
    const chatName = (chat.display_name || chat.file_name || '').trim().toLowerCase();
    if (!chatName) return true;
    const chatTs = new Date(chat.updated_at || 0).getTime();

    for (let i = 0; i < idx; i++) {
      const prev = arr[i];
      const prevName = (prev.display_name || prev.file_name || '').trim().toLowerCase();
      if (!prevName || prevName !== chatName) continue;
      if ((prev.context_type || 'file') !== (chat.context_type || 'file')) continue;
      if ((prev.message_count ?? -1) !== (chat.message_count ?? -1)) continue;

      const prevTs = new Date(prev.updated_at || 0).getTime();
      const diffSec = Math.abs(prevTs - chatTs) / 1000;
      if (diffSec <= 90) {
        // Keep selected chat if one of duplicates is active.
        if (currentChatId === chat.id) return true;
        return false;
      }
    }
    return true;
  });

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateString.split('T')[0];
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();

    if (!confirm('Delete this chat? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setChats(chats.filter(c => c.id !== chatId));
        // console.log(`[ChatSidebar] Deleted chat ${chatId}`);
      } else {
        console.error(`[ChatSidebar] Error deleting chat: ${response.status}`);
      }
    } catch (error) {
      console.error('[ChatSidebar] Error deleting chat:', error);
    }
  };

  // Phase 74: Inline rename in sidebar (prompt() is unreliable in Tauri)
  const handleRenameChat = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    const currentName = (chat.display_name || chat.file_name || '').trim();
    setRenamingChatId(chat.id);
    setRenameValue(currentName);
  };

  const submitRenameChat = async (chat: Chat) => {
    const currentName = (chat.display_name || chat.file_name || '').trim();
    const nextName = renameValue.trim();

    setRenamingChatId(null);

    if (!nextName || nextName === currentName) {
      return;
    }

    try {
      const response = await fetch(`/api/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: nextName })
      });

      if (response.ok) {
        // Update local state
        const normalizedName = nextName;
        setChats(prev => prev.map(c =>
          c.id === chat.id ? { ...c, display_name: normalizedName } : c
        ));
        window.dispatchEvent(new CustomEvent('chat-renamed', {
          detail: { chatId: chat.id, newName: normalizedName }
        }));
      } else {
        console.error(`[ChatSidebar] Error renaming chat: ${response.status}`);
      }
    } catch (error) {
      console.error('[ChatSidebar] Error renaming chat:', error);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();

    const nextValue = !chat.is_favorite;
    try {
      const response = await fetch(`/api/chats/${chat.id}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: nextValue }),
      });

      if (!response.ok) {
        console.error(`[ChatSidebar] Error toggling favorite: ${response.status}`);
        return;
      }

      setChats(prev =>
        prev.map(c => (c.id === chat.id ? { ...c, is_favorite: nextValue } : c))
      );

      window.dispatchEvent(new CustomEvent('chat-favorited', {
        detail: { chatId: chat.id, is_favorite: nextValue }
      }));
    } catch (error) {
      console.error('[ChatSidebar] Error toggling favorite:', error);
    }
  };

  const handleSelectChatClick = (chat: Chat) => {
    onSelectChat(chat.id, chat.file_path, chat.file_name);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="chat-sidebar">
      {/* Header */}
      <div className="chat-sidebar-header">
        <h3 className="chat-sidebar-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Chat History
        </h3>
        {onClose && (
          <button className="chat-sidebar-close" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="chat-sidebar-search">
        <input
          type="text"
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="chat-sidebar-search-input"
        />
      </div>

      {/* Chats List */}
      <div className="chat-sidebar-list" ref={listRef}>
        {/* MARKER_129.2B: Skeleton loading */}
        {loading && <ChatSkeleton />}

        {!loading && dedupedChats.length === 0 && (
          <div className="chat-sidebar-empty">
            {chats.length === 0 ? 'No chats yet' : 'No matches found'}
          </div>
        )}

        {!loading && dedupedChats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-sidebar-item ${
              currentChatId === chat.id ? 'active' : ''
            }`}
            onClick={() => handleSelectChatClick(chat)}
          >
            <div className="chat-sidebar-item-content">
              <div className="chat-sidebar-item-name">
                {/* MARKER_137.4E: Primary distinction is Team vs Solo chat, not file/folder context */}
                {chat.chat_kind === 'team' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    {/* Team icon: robot + human (aligned with existing ChatPanel semantics) */}
                    <rect x="3" y="6" width="10" height="8" rx="1.5" />
                    <circle cx="6" cy="10" r="1" fill="currentColor" />
                    <circle cx="10" cy="10" r="1" fill="currentColor" />
                    <line x1="6" y1="12.5" x2="10" y2="12.5" />
                    <line x1="8" y1="6" x2="8" y2="4" />
                    <circle cx="8" cy="3.5" r="0.5" fill="currentColor" />
                    <circle cx="18" cy="7" r="2.5" />
                    <path d="M14 20v-3a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v3" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                )}
                {renamingChatId === chat.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    className="chat-sidebar-rename-input"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => { void submitRenameChat(chat); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitRenameChat(chat);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenamingChatId(null);
                      }
                    }}
                  />
                ) : (
                  <span style={{ marginLeft: 6 }}>{chat.display_name || chat.file_name}</span>
                )}
              </div>
              <div className="chat-sidebar-item-meta">
                <span className="chat-sidebar-item-time">
                  {formatDate(chat.updated_at)}
                </span>
                {chat.message_count !== undefined && (
                  <span className="chat-sidebar-item-count">
                    {chat.message_count} msg
                  </span>
                )}
              </div>
            </div>

            {/* Phase 74.3: Actions with SVG icons */}
            {/* MARKER_EDIT_NAME_SIDEBAR: Edit Name button in sidebar history */}
            {/* Status: WORKING - handleRenameChat() -> PATCH /api/chats/{id} */}
            {/* Issue: NONE - This button is fully functional */}
            <div className="chat-sidebar-item-actions-wrap">
              <button
                className={`chat-sidebar-item-favorite ${chat.is_favorite ? 'active' : ''}`}
                onClick={(e) => handleToggleFavorite(e, chat)}
                title={chat.is_favorite ? 'Remove favorite' : 'Add favorite'}
              >
                <svg className="chat-sidebar-favorite-star" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.7l2.6 5.2 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
                </svg>
              </button>
              <div className="chat-sidebar-item-actions">
              <button
                className="chat-sidebar-item-edit"
                onClick={(e) => handleRenameChat(e, chat)}
                title="Rename chat"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                className="chat-sidebar-item-delete"
                onClick={(e) => handleDeleteChat(e, chat.id)}
                title="Delete chat"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
              </div>
            </div>
          </div>
        ))}

        {/* MARKER_129.2C: Scroll trigger for infinite load */}
        {hasMore && !loading && (
          <div ref={loadMoreRef} className="chat-sidebar-load-trigger">
            {loadingMore && (
              <div className="chat-sidebar-loading-more">
                <span className="chat-loading-spinner" />
                Loading more...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with Refresh and Load More */}
      <div className="chat-sidebar-footer">
        <button
          className="chat-sidebar-refresh"
          onClick={() => loadChats(true)}
          disabled={loading}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {loading ? 'Loading...' : 'Refresh'}
        </button>

        {hasMore && !loading && (
          <button
            className="chat-sidebar-load-more"
            onClick={loadMoreChats}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : `Load More (${chats.length}/${total})`}
          </button>
        )}

        {!hasMore && chats.length > 0 && (
          <div className="chat-sidebar-footer-info">
            All {total} chats loaded
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
