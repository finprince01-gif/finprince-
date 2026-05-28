import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { showInfo, showSuccess, confirm } from '../utils/toast';

type Position = {
  x: number;
  y: number;
};

type Reminder = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  description: string;
  triggered?: boolean;
};

const BUTTON_SIZE = 48;
const PANEL_WIDTH = 356;
const PANEL_HEIGHT = 480;
const EDGE_PADDING = 16;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getInitialPosition = (): Position => {
  if (typeof window === 'undefined') {
    return { x: 1140, y: 24 };
  }

  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - BUTTON_SIZE - 48 - BUTTON_SIZE - 16),
    y: 24,
  };
};

const getPanelPosition = (buttonPosition: Position, currentScale: number = 1.0): Position => ({
  x: clamp(
    buttonPosition.x + BUTTON_SIZE - PANEL_WIDTH * currentScale,
    EDGE_PADDING,
    window.innerWidth - PANEL_WIDTH * currentScale - EDGE_PADDING
  ),
  y: clamp(buttonPosition.y, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT * currentScale - EDGE_PADDING),
});

const FloatingCalendar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    (window as any).toggleGlobalCalendar = (open?: boolean) => {
      setIsOpen(prev => open !== undefined ? open : !prev);
    };
    return () => {
      delete (window as any).toggleGlobalCalendar;
    };
  }, []);

  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [scale, setScale] = useState(1.0);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'day-details' | 'add-reminder'>('calendar');

  // Reminders State
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    try {
      const stored = localStorage.getItem('calendar_reminders');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Active Alerts State
  const [activeAlerts, setActiveAlerts] = useState<Reminder[]>([]);
  const remindersRef = useRef<Reminder[]>([]);

  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTime, setNewTime] = useState('12:00');

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
  
  // Save reminders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('calendar_reminders', JSON.stringify(reminders));
  }, [reminders]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: clamp(prev.x, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
        y: clamp(prev.y, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
      }));
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Background reminder checker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const localTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const triggeredList: Reminder[] = [];
      const updated = remindersRef.current.map(rem => {
        if (rem.date === localDateStr && rem.time === localTimeStr && !rem.triggered) {
          triggeredList.push(rem);
          return { ...rem, triggered: true };
        }
        return rem;
      });

      if (triggeredList.length > 0) {
        setReminders(updated);
        setActiveAlerts(prev => [...prev, ...triggeredList]);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Drag Pointer events
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const dragPosition = isOpen ? getPanelPosition(position, scale) : position;
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

    if (isOpen) {
      const nextPanelX = clamp(drag.initialX + deltaX, EDGE_PADDING, window.innerWidth - PANEL_WIDTH * scale - EDGE_PADDING);
      const nextPanelY = clamp(drag.initialY + deltaY, EDGE_PADDING, window.innerHeight - PANEL_HEIGHT * scale - EDGE_PADDING);

      setPosition({
        x: clamp(nextPanelX + PANEL_WIDTH * scale - BUTTON_SIZE, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
        y: clamp(nextPanelY, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
      });
      return;
    }

    setPosition({
      x: clamp(drag.initialX + deltaX, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
      y: clamp(drag.initialY + deltaY, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragState.current = null;
  };

  // Resize Pointer events
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
    const newScale = clamp(Math.max(scaleFromWidth, scaleFromHeight), 0.7, 2.0);
    
    setScale(newScale);

    setPosition({
      x: clamp(drag.panelLeft - BUTTON_SIZE + PANEL_WIDTH * newScale, EDGE_PADDING, window.innerWidth - BUTTON_SIZE - EDGE_PADDING),
      y: clamp(drag.panelTop, EDGE_PADDING, window.innerHeight - BUTTON_SIZE - EDGE_PADDING),
    });
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resizeState.current = null;
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Create list of days for grid
  const daysArray = useMemo(() => {
    const arr = [];
    // Previous month days to fill
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      arr.push({
        dayNum: prevMonthDays - i,
        isCurrentMonth: false,
        dateObj: new Date(year, month - 1, prevMonthDays - i),
      });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      arr.push({
        dayNum: i,
        isCurrentMonth: true,
        dateObj: new Date(year, month, i),
      });
    }
    // Next month days to fill (grid size is 35 or 42)
    const remaining = arr.length % 7 === 0 ? 0 : 7 - (arr.length % 7);
    for (let i = 1; i <= remaining; i++) {
      arr.push({
        dayNum: i,
        isCurrentMonth: false,
        dateObj: new Date(year, month + 1, i),
      });
    }
    return arr;
  }, [year, month, daysInMonth, firstDayIndex]);

  const formatDateStr = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const hasReminderOnDate = (date: Date) => {
    const dStr = formatDateStr(date);
    return reminders.some(r => r.date === dStr);
  };

  const selectedDateStr = formatDateStr(selectedDate);
  const remindersForSelected = reminders.filter(r => r.date === selectedDateStr);

  const upcomingReminders = useMemo(() => {
    const nowStr = formatDateStr(new Date());
    return reminders
      .filter(r => r.date >= nowStr && !r.triggered)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 3);
  }, [reminders]);

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      showInfo('Please enter a title');
      return;
    }
    const newRem: Reminder = {
      id: Date.now().toString(),
      date: selectedDateStr,
      time: newTime,
      title: newTitle,
      description: newDescription,
      triggered: false,
    };
    setReminders(prev => [...prev, newRem]);
    setNewTitle('');
    setNewDescription('');
    setNewTime('12:00');
    setViewMode('day-details');
    showSuccess('Reminder added successfully!');
  };

  const handleDeleteReminder = async (id: string) => {
    if (!await confirm('Are you sure you want to delete this reminder?')) return;
    setReminders(prev => prev.filter(r => r.id !== id));
    showSuccess('Reminder deleted!');
  };

  const handleDismissAlert = (id: string) => {
    setActiveAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const panelPosition = getPanelPosition(position, scale);

  return (
    <>
      <style>{`
        @keyframes slideInFromRight {
          0% {
            transform: translateX(120%);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slideInFromRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes pulseSlow {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 0 8px rgba(124, 58, 237, 0);
          }
        }
        .animate-pulse-slow {
          animation: pulseSlow 2s infinite ease-in-out;
        }
      `}</style>

      {!isOpen ? null : (
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
          aria-label="Calendar Widget"
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
                <Icon name="calendar" className="w-4 h-4" />
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">Reminders</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                  {viewMode === 'calendar' ? 'Month View' : viewMode === 'day-details' ? 'Day Details' : 'Add Reminder'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {viewMode !== 'calendar' && (
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
                    setViewMode('calendar');
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Back to Month View"
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
                  setViewMode('calendar');
                }}
                className="flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Close Calendar"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative p-4 h-[calc(100%-65px)] overflow-y-auto">
            {viewMode === 'calendar' && (
              <div className="space-y-4">
                {/* Month Header Navigation */}
                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-[10px] border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
                  >
                    <Icon name="chevron-left" className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    {monthNames[month]} {year}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
                  >
                    <Icon name="chevron-right" className="w-4 h-4" />
                  </button>
                </div>

                {/* Calendar Grid */}
                <div className="bg-white p-3 rounded-[14px] border border-slate-200 shadow-sm">
                  {/* Day Labels */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                      <span key={idx} className="text-[10px] font-black text-slate-400 uppercase">
                        {day}
                      </span>
                    ))}
                  </div>
                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {daysArray.map((day, idx) => {
                      const isSelected = formatDateStr(day.dateObj) === selectedDateStr;
                      const isToday = formatDateStr(day.dateObj) === formatDateStr(new Date());
                      const hasRem = hasReminderOnDate(day.dateObj);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedDate(day.dateObj);
                            setViewMode('day-details');
                          }}
                          className={`h-9 w-9 text-xs font-semibold rounded-full flex flex-col items-center justify-center relative transition-all active:scale-90 ${
                            day.isCurrentMonth ? 'text-slate-800' : 'text-slate-300'
                          } ${
                            isSelected
                              ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-200'
                              : isToday
                              ? 'bg-purple-50 border border-purple-300 text-purple-700 font-bold'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <span>{day.dayNum}</span>
                          {hasRem && (
                            <span
                              className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                                isSelected ? 'bg-white' : 'bg-purple-600'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Upcoming Reminders Section */}
                <div className="bg-white p-3 rounded-[14px] border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                    Upcoming Reminders
                  </span>
                  {upcomingReminders.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No upcoming reminders</p>
                  ) : (
                    <div className="space-y-2">
                      {upcomingReminders.map(rem => (
                        <div
                          key={rem.id}
                          onClick={() => {
                            const parts = rem.date.split('-');
                            setSelectedDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
                            setViewMode('day-details');
                          }}
                          className="text-xs p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-purple-300 cursor-pointer transition-all flex justify-between items-center"
                        >
                          <div className="truncate pr-2">
                            <p className="font-bold text-slate-700 truncate">{rem.title}</p>
                            <p className="text-[10px] text-slate-400">{rem.date} @ {rem.time}</p>
                          </div>
                          <span className="text-[10px] bg-purple-50 text-purple-600 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                            Active
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewMode === 'day-details' && (
              <div className="space-y-4">
                {/* Header info */}
                <div className="flex justify-between items-center bg-white p-3 rounded-[10px] border border-slate-200 shadow-sm">
                  <span className="text-sm font-bold text-slate-800">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMode('add-reminder')}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                  >
                    <Icon name="plus" className="w-3 h-3" /> Add
                  </button>
                </div>

                {/* List of Reminders */}
                <div className="space-y-2.5">
                  {remindersForSelected.length === 0 ? (
                    <div className="bg-white p-6 rounded-[14px] border border-slate-200 text-center shadow-sm">
                      <p className="text-sm text-slate-400 italic">No reminders for this day</p>
                      <button
                        type="button"
                        onClick={() => setViewMode('add-reminder')}
                        className="mt-3 text-xs font-bold text-purple-600 hover:underline"
                      >
                        Create a reminder
                      </button>
                    </div>
                  ) : (
                    remindersForSelected.map(rem => (
                      <div
                        key={rem.id}
                        className="bg-white p-3.5 rounded-[14px] border border-slate-200 shadow-sm flex justify-between items-start gap-3 group relative hover:border-purple-300 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-slate-900 truncate">{rem.title}</span>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded-full">
                              {rem.time}
                            </span>
                          </div>
                          {rem.description && (
                            <p className="text-xs text-slate-500 whitespace-pre-wrap leading-relaxed">
                              {rem.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteReminder(rem.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete reminder"
                        >
                          <Icon name="trash-2" className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {viewMode === 'add-reminder' && (
              <div className="bg-white p-4 rounded-[14px] border border-slate-200 shadow-sm space-y-4">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 block border-b border-slate-100 pb-2">
                  New Reminder for {selectedDate.toLocaleDateString()}
                </span>
                <form onSubmit={handleAddReminder} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Call Client / Check GRN"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Description (Optional)</label>
                    <textarea
                      placeholder="Details of reminder..."
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Time</label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={e => setNewTime(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setViewMode('day-details')}
                      className="flex-1 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors shadow-md shadow-purple-200 uppercase tracking-wider"
                    >
                      Save
                    </button>
                  </div>
                </form>
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
      )}

      {/* Active Alerts Stack */}
      {activeAlerts.length > 0 && (
        <div className="fixed top-24 right-6 z-[9999] flex flex-col gap-3 w-80 md:w-[350px] max-h-[80vh] overflow-y-auto">
          {activeAlerts.map(alert => (
            <div
              key={alert.id}
              className="bg-white/95 backdrop-blur-md border border-purple-100 rounded-[14px] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.12)] flex gap-3 transition-all duration-300 animate-slide-in-right select-none text-left"
              style={{
                borderLeft: '4px solid #7c3aed',
              }}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 animate-pulse-slow">
                <Icon name="bell" className="w-5 h-5" />
              </div>
              
              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate pr-2">
                    {alert.title}
                  </h4>
                  <span className="text-[9px] font-black uppercase text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {alert.time}
                  </span>
                </div>
                {alert.description && (
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">
                    {alert.description}
                  </p>
                )}
                <div className="flex justify-end mt-3">
                  <button
                    type="button"
                    onClick={() => handleDismissAlert(alert.id)}
                    className="text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDismissAlert(alert.id)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 transition-all"
                aria-label="Close Alert"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default FloatingCalendar;
