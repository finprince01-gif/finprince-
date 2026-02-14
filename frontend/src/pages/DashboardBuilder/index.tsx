import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Page, Voucher, Ledger } from '../../types';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardStore, Widget } from '../../store/dashboardStore';
import WidgetRenderer from './WidgetRenderer';
import RightPanel from './RightPanel';
import GlobalFilterBar from './GlobalFilterBar';
import { Save, RotateCcw, Monitor, ChevronLeft, LayoutDashboard, Share2, Plus, Download, Maximize, Minimize } from 'lucide-react';
import { showSuccess, showError, showInfo } from '../../utils/toast';

interface DashboardBuilderPageProps {
    vouchers: Voucher[];
    ledgers: Ledger[];
    onNavigate?: (page: Page) => void;
}

const STORAGE_KEY = 'bi_dashboard_config_v2';
const GRID_SIZE = 20;

const DashboardBuilderPage: React.FC<DashboardBuilderPageProps> = ({ vouchers, ledgers, onNavigate }) => {
    const {
        widgets,
        setWidgets,
        selectedWidgetId,
        selectWidget,
        updateWidget,
        globalFilters
    } = useDashboardStore();

    const [isFullScreen, setIsFullScreen] = useState(false);
    const canvasRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    // Resize state
    const [activeResizeId, setActiveResizeId] = useState<string | null>(null);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
    const [resizeStartSize, setResizeStartSize] = useState({ width: 0, height: 0, x: 0, y: 0 });

    const {
        revenueData,
        expenseBreakdown,
    } = useDashboardData(vouchers, ledgers);

    // Filter data based on global filters
    const availableCustomers = useMemo(() => Array.from(new Set(vouchers.filter(v => v.type === 'Sales').map(v => (v as any).party))).filter(Boolean).sort(), [vouchers]);
    const availableVendors = useMemo(() => Array.from(new Set(vouchers.filter(v => v.type === 'Purchase').map(v => (v as any).party))).filter(Boolean).sort(), [vouchers]);

    // Initialize & Persistence
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) setWidgets(parsed);
            } catch (e) { console.error(e); }
        } else {
            // Default Template
            setWidgets([
                {
                    id: 'rev-trend',
                    type: 'line',
                    title: 'Revenue Trend',
                    dataset: 'Sales',
                    xField: 'Date',
                    yField: 'Amount',
                    x: 40, y: 40, width: 600, height: 320,
                    aggregation: 'sum',
                    properties: { showLegend: true, showGridlines: true, colorTheme: '#4f46e5', numberFormat: 'Currency' }
                },
                {
                    id: 'exp-pie',
                    type: 'pie',
                    title: 'Expense Mix',
                    dataset: 'Expenses',
                    xField: 'Category',
                    yField: 'Amount',
                    x: 660, y: 40, width: 340, height: 320,
                    aggregation: 'sum',
                    properties: { showLegend: true, showGridlines: false, colorTheme: '#10b981', numberFormat: 'Currency' }
                }
            ]);
        }
    }, [setWidgets]);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
        window.dispatchEvent(new Event('dashboard-layout-updated'));
        showSuccess('BI Dashboard Configuration Saved!');
        onNavigate?.('Dashboard');
    };

    const handleShare = () => {
        const config = JSON.stringify(widgets);
        navigator.clipboard.writeText(config).then(() => {
            showInfo('System: BI Configuration copied to clipboard! You can share this string with others or save it as a backup.');
        });
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(widgets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "bi_dashboard_export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                showError(`Error attempting to enable full-screen mode: ${err.message}`);
            });
            setIsFullScreen(true);
        } else {
            document.exitFullscreen();
            setIsFullScreen(false);
        }
    };

    const handleWidgetDragStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const widget = widgets.find(w => w.id === id);
        if (!widget) return;

        selectWidget(id);
        setActiveDragId(id);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    const handleResizeStart = (e: React.MouseEvent, id: string, handle: string) => {
        e.stopPropagation();
        e.preventDefault();
        const widget = widgets.find(w => w.id === id);
        if (!widget) return;

        setActiveResizeId(id);
        setResizeHandle(handle);
        setResizeStartPos({ x: e.clientX, y: e.clientY });
        setResizeStartSize({ width: widget.width, height: widget.height, x: widget.x, y: widget.y });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (activeDragId && !activeResizeId && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left + canvasRef.current.scrollLeft - dragOffset.x;
            const y = e.clientY - rect.top + canvasRef.current.scrollTop - dragOffset.y;
            const snappedX = Math.max(0, Math.round(x / GRID_SIZE) * GRID_SIZE);
            const snappedY = Math.max(0, Math.round(y / GRID_SIZE) * GRID_SIZE);
            updateWidget(activeDragId, { x: snappedX, y: snappedY });
        } else if (activeResizeId && canvasRef.current) {
            const deltaX = e.clientX - resizeStartPos.x;
            const deltaY = e.clientY - resizeStartPos.y;
            let newWidth = resizeStartSize.width;
            let newHeight = resizeStartSize.height;

            if (resizeHandle === 'se') {
                newWidth = Math.max(200, Math.round((resizeStartSize.width + deltaX) / GRID_SIZE) * GRID_SIZE);
                newHeight = Math.max(150, Math.round((resizeStartSize.height + deltaY) / GRID_SIZE) * GRID_SIZE);
            }
            updateWidget(activeResizeId, { width: newWidth, height: newHeight });
        }
    };

    const handleMouseUp = () => {
        setActiveDragId(null);
        setActiveResizeId(null);
        setResizeHandle(null);
    };

    useEffect(() => {
        if (activeDragId || activeResizeId) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [activeDragId, activeResizeId, dragOffset, resizeStartPos, resizeStartSize, resizeHandle]);

    const getWidgetData = (widget: Widget) => {
        const { dataset, xField, yField, aggregation } = widget;

        // Use vouchers for Sales/Expenses datasets
        if (dataset === 'Sales' || dataset === 'Expenses') {
            const typeFilter = dataset === 'Sales' ? ['Sales'] : ['Purchase', 'Expenses'];

            let filtered = vouchers.filter(v => typeFilter.includes(v.type));

            // Apply Global Filters
            if (globalFilters.customer && dataset === 'Sales') {
                filtered = filtered.filter(v => (v as any).party === globalFilters.customer);
            }
            if (globalFilters.vendor && dataset === 'Expenses') {
                filtered = filtered.filter(v => (v as any).party === globalFilters.vendor);
            }

            // Group by xField
            const groups: Record<string, number[]> = {};
            filtered.forEach(v => {
                let key = 'Other';
                if (xField === 'Date') key = v.date;
                else if (xField === 'Customer' || xField === 'Vendor' || xField === 'Party') key = (v as any).party || 'Unknown';
                else if (xField === 'Product') key = (v as any).items?.[0]?.name || 'N/A';
                else if (xField === 'Category') key = (v as any).category || 'General';

                const val = (v as any).total || (v as any).amount || 0;
                if (!groups[key]) groups[key] = [];
                groups[key].push(val);
            });

            // Aggregate
            return Object.entries(groups).map(([name, vals]) => {
                let value = 0;
                if (aggregation === 'sum') value = vals.reduce((a, b) => a + b, 0);
                else if (aggregation === 'avg') value = vals.reduce((a, b) => a + b, 0) / vals.length;
                else if (aggregation === 'count') value = vals.length;

                return {
                    name,
                    [xField || 'name']: name,
                    [yField || 'value']: value,
                    value
                };
            }).sort((a, b) => a.name.localeCompare(b.name));
        }

        // Fallback for mock datasets
        return [{ name: 'Jan', value: 400 }, { name: 'Feb', value: 300 }, { name: 'Mar', value: 600 }];
    };

    return (
        <div ref={containerRef} className={`flex flex-col h-screen ${isFullScreen ? 'bg-white' : ''} bg-slate-50 overflow-hidden font-sans border-t border-slate-200`}>
            {/* Nav Header */}
            <header className="bg-white px-6 py-3.5 flex items-center justify-between border-b border-slate-200 shadow-sm z-50">
                <div className="flex items-center gap-6">
                    <button onClick={() => onNavigate?.('Dashboard')} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all active:scale-95">
                        <ChevronLeft size={20} strokeWidth={3} />
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-100">
                            <Monitor size={18} className="text-white" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-sm font-black tracking-tight text-slate-800 uppercase leading-none">BI Analytics Pro</h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                Designer Experience {isFullScreen && '• Full Screen'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={handleShare} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
                        <Share2 size={14} /> Share
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
                        <Download size={14} /> Export
                    </button>
                    <button onClick={toggleFullScreen} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
                        {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />} {isFullScreen ? 'Minimize' : 'Focus'}
                    </button>
                    <div className="w-px h-6 bg-slate-200 mx-2" />
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2.5 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-[1.02] active:scale-95"
                    >
                        <Save size={14} strokeWidth={3} /> Save & Exit
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Designer Canvas */}
                <div className="flex-1 flex flex-col bg-slate-100/50 overflow-hidden relative">
                    <GlobalFilterBar customers={availableCustomers} vendors={availableVendors} />

                    <div className="flex-1 overflow-auto p-12 custom-scrollbar">
                        <div
                            ref={canvasRef}
                            onClick={() => selectWidget(null)}
                            className="relative min-w-[1250px] min-h-[900px] bg-white rounded-3xl border-2 border-slate-200 shadow-[0_0_100px_rgba(0,0,0,0.02)]"
                            style={{
                                backgroundImage: 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)',
                                backgroundSize: '24px 24px'
                            }}
                        >
                            {widgets.map(widget => (
                                <div
                                    key={widget.id}
                                    onMouseDown={(e) => handleWidgetDragStart(e, widget.id)}
                                    className={`absolute cursor-move overflow-hidden rounded-2xl border-4 transition-all duration-300 ${selectedWidgetId === widget.id ? 'border-indigo-500 ring-8 ring-indigo-50 shadow-2xl z-20' : 'border-transparent shadow-md hover:shadow-xl z-10'
                                        }`}
                                    style={{
                                        left: widget.x,
                                        top: widget.y,
                                        width: widget.width,
                                        height: widget.height
                                    }}
                                >
                                    <WidgetRenderer widget={widget} data={getWidgetData(widget)} />

                                    {/* Resize handle */}
                                    {selectedWidgetId === widget.id && (
                                        <div
                                            onMouseDown={(e) => handleResizeStart(e, widget.id, 'se')}
                                            className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize flex items-center justify-center group/res"
                                        >
                                            <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-300 group-hover/res:border-indigo-500 transition-colors" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {widgets.length === 0 && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
                                    <LayoutDashboard size={80} strokeWidth={0.5} className="opacity-10 mb-6" />
                                    <p className="text-xl font-black uppercase tracking-[0.3em] opacity-30">Surface Ready</p>
                                    <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-[0.2em]">Add visuals to begin the narration</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Properties & Library Panel */}
                <RightPanel />
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
            `}</style>
        </div>
    );
};

export default DashboardBuilderPage;
