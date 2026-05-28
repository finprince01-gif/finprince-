import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { showInfo, showSuccess, confirm } from '../utils/toast';

type Position = {
  x: number;
  y: number;
};

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

const BUTTON_SIZE = 48;
const PANEL_WIDTH = 356;
const PANEL_HEIGHT = 480;
const EDGE_PADDING = 16;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getInitialPosition = (): Position => {
  if (typeof window === 'undefined') {
    return { x: 1080, y: 100 };
  }
  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - 80),
    y: 100,
  };
};

const getPanelPosition = (buttonPosition: Position, currentScale: number = 1.0): Position => ({
  x: clamp(
    buttonPosition.x,
    EDGE_PADDING,
    window.innerWidth - PANEL_WIDTH * currentScale - EDGE_PADDING
  ),
  y: clamp(buttonPosition.y, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT * currentScale - EDGE_PADDING),
});

const FloatingNotes: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    (window as any).toggleGlobalNotes = (open?: boolean) => {
      setIsOpen(prev => open !== undefined ? open : !prev);
    };
    return () => {
      delete (window as any).toggleGlobalNotes;
    };
  }, []);

  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [scale, setScale] = useState(0.8);
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit' | 'view'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Notes State
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const stored = localStorage.getItem('erp_notes_list');
      if (stored) return JSON.parse(stored);
      // Default welcome note
      return [
        {
          id: 'welcome',
          title: 'Welcome to Notes',
          content: 'You can write anything here! Click the "+" button in the header to create a new note.\n\nNotes are automatically saved locally on your device.',
          updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        }
      ];
    } catch {
      return [];
    }
  });

  // Current Active Note for view/edit
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Form Fields
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const suppressClickRef = useRef(false);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    moved: boolean;
  } | null>(null);

  const resizeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScale: number;
    panelLeft: number;
    panelTop: number;
  } | null>(null);

  // Save notes to localStorage
  useEffect(() => {
    localStorage.setItem('erp_notes_list', JSON.stringify(notes));
  }, [notes]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: clamp(prev.x, EDGE_PADDING, window.innerWidth - PANEL_WIDTH * scale - EDGE_PADDING),
        y: clamp(prev.y, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT * scale - EDGE_PADDING),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scale]);

  // Drag Handlers
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const dragPosition = position;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: dragPosition.x,
      initialY: dragPosition.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      drag.moved = true;
    }

    const nextPanelX = clamp(drag.initialX + deltaX, EDGE_PADDING, window.innerWidth - PANEL_WIDTH * scale - EDGE_PADDING);
    const nextPanelY = clamp(drag.initialY + deltaY, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT * scale - EDGE_PADDING);

    setPosition({ x: nextPanelX, y: nextPanelY });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragState.current = null;
  };

  // Resize Handlers
  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const panelPos = getPanelPosition(position, scale);
    resizeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScale: scale,
      panelLeft: panelPos.x,
      panelTop: panelPos.y,
    };
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const currentWidth = event.clientX - drag.panelLeft;
    const currentHeight = event.clientY - drag.panelTop;
    const scaleFromWidth = currentWidth / PANEL_WIDTH;
    const scaleFromHeight = currentHeight / PANEL_HEIGHT;
    const newScale = clamp(Math.max(scaleFromWidth, scaleFromHeight), 0.5, 1.8);

    setScale(newScale);
    setPosition({
      x: clamp(drag.panelLeft, EDGE_PADDING, window.innerWidth - PANEL_WIDTH * newScale - EDGE_PADDING),
      y: clamp(drag.panelTop, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT * newScale - EDGE_PADDING),
    });
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resizeState.current = null;
  };

  // Notes Actions
  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) {
      showInfo('Please enter a note title');
      return;
    }
    const newNote: Note = {
      id: Date.now().toString(),
      title: noteTitle,
      content: noteContent,
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };

    setNotes(prev => [newNote, ...prev]);
    setNoteTitle('');
    setNoteContent('');
    setViewMode('list');
    showSuccess('Note created successfully!');
  };

  const handleUpdateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNoteId) return;
    if (!noteTitle.trim()) {
      showInfo('Please enter a note title');
      return;
    }

    setNotes(prev => prev.map(n => n.id === activeNoteId ? {
      ...n,
      title: noteTitle,
      content: noteContent,
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    } : n));

    setNoteTitle('');
    setNoteContent('');
    setViewMode('view');
    showSuccess('Note saved!');
  };

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirm('Are you sure you want to delete this note?')) return;
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setViewMode('list');
    }
    showSuccess('Note deleted!');
  };

  const startEdit = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setViewMode('edit');
  };

  const startView = (note: Note) => {
    setActiveNoteId(note.id);
    setViewMode('view');
  };

  const currentActiveNote = useMemo(() => {
    return notes.find(n => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return notes;
    return notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, searchQuery]);

  if (!isOpen) return null;

  const panelPosition = getPanelPosition(position, scale);

  return (
    <section
      className="fixed bg-slate-50 border border-white/80 rounded-[14px] shadow-[0_24px_60px_rgba(15,23,42,0.24)] overflow-hidden text-left"
      style={{
        left: panelPosition.x,
        top: panelPosition.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        zIndex: 45,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
      aria-label="Notes Widget"
    >
      {/* Drag Handle Header */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragState.current = null;
        }}
        className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center w-10 h-10 rounded-full text-white"
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              boxShadow: '0 6px 18px rgba(124,58,237,0.45)',
            }}
          >
            <Icon name="file-text" className="w-4 h-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Quick Notes</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">
              {viewMode === 'list' ? 'My Notes' : viewMode === 'create' ? 'New Note' : viewMode === 'edit' ? 'Edit Note' : 'View Note'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {viewMode === 'list' && (
            <button
              type="button"
              onPointerDown={event => {
                event.stopPropagation();
                dragState.current = null;
              }}
              onPointerMove={event => event.stopPropagation()}
              onPointerUp={event => event.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setNoteTitle('');
                setNoteContent('');
                setViewMode('create');
              }}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-purple-600"
              title="Create New Note"
            >
              <Icon name="plus" className="w-4 h-4" />
            </button>
          )}
          {viewMode !== 'list' && (
            <button
              type="button"
              onPointerDown={event => {
                event.stopPropagation();
                dragState.current = null;
              }}
              onPointerMove={event => event.stopPropagation()}
              onPointerUp={event => event.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('list');
              }}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Back to List"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={event => {
              event.stopPropagation();
              dragState.current = null;
            }}
            onPointerMove={event => event.stopPropagation()}
            onPointerUp={event => event.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Close Notes"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative p-4 h-[calc(100%-65px)] overflow-y-auto">
        {viewMode === 'list' && (
          <div className="space-y-4 h-full flex flex-col">
            {/* Search bar */}
            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-purple-500">
              <Icon name="search" className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs focus:outline-none bg-transparent"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto space-y-2.5 min-h-[300px]">
              {filteredNotes.length === 0 ? (
                <div className="bg-white p-6 rounded-[14px] border border-slate-200 text-center shadow-sm">
                  <p className="text-sm text-slate-400 italic">No notes found</p>
                  <button
                    type="button"
                    onClick={() => setViewMode('create')}
                    className="mt-3 text-xs font-bold text-purple-600 hover:underline"
                  >
                    Write your first note
                  </button>
                </div>
              ) : (
                filteredNotes.map(note => (
                  <div
                    key={note.id}
                    onClick={() => startView(note)}
                    className="bg-white p-3.5 rounded-[14px] border border-slate-200 shadow-sm flex flex-col gap-1.5 cursor-pointer hover:border-purple-300 transition-all group relative"
                  >
                    <div className="flex justify-between items-start pr-12">
                      <span className="text-xs font-black text-slate-900 truncate tracking-wide">{note.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                      {note.updatedAt}
                    </span>

                    {/* Quick actions overlay visible on hover */}
                    <div className="absolute right-3.5 top-3.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => startEdit(note, e)}
                        className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                        title="Edit note"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNote(note.id, e)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        title="Delete note"
                      >
                        <Icon name="trash-2" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {viewMode === 'create' && (
          <div className="bg-white p-4 rounded-[14px] border border-slate-200 shadow-sm space-y-4">
            <form onSubmit={handleCreateNote} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  placeholder="Note title..."
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Content</label>
                <textarea
                  placeholder="Start typing your note here..."
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="flex-1 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors shadow-md shadow-purple-200 uppercase tracking-wider"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        )}

        {viewMode === 'edit' && (
          <div className="bg-white p-4 rounded-[14px] border border-slate-200 shadow-sm space-y-4">
            <form onSubmit={handleUpdateNote} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  placeholder="Note title..."
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Content</label>
                <textarea
                  placeholder="Start typing your note here..."
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setViewMode('view')}
                  className="flex-1 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors shadow-md shadow-purple-200 uppercase tracking-wider"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {viewMode === 'view' && currentActiveNote && (
          <div className="bg-white p-4.5 rounded-[14px] border border-slate-200 shadow-sm space-y-4 min-h-[300px] flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-wide uppercase">{currentActiveNote.title}</h3>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-1">
                    Last updated: {currentActiveNote.updatedAt}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => startEdit(currentActiveNote, e)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                    title="Edit Note"
                  >
                    <Icon name="edit" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteNote(currentActiveNote.id, e)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                    title="Delete Note"
                  >
                    <Icon name="trash-2" className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-650 whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-[220px]">
                {currentActiveNote.content}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-4 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
              >
                Back to List
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={() => {
          resizeState.current = null;
        }}
        className="absolute bottom-1.5 right-1.5 w-6 h-6 cursor-se-resize flex items-center justify-center z-50 group hover:bg-slate-200/70 rounded-full transition-colors"
        style={{ touchAction: 'none' }}
      >
        <svg
          className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 transition-colors pointer-events-none"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="8" y1="2" x2="2" y2="8" />
          <line x1="8" y1="5" x2="5" y2="8" />
        </svg>
      </div>
    </section>
  );
};

export default FloatingNotes;
