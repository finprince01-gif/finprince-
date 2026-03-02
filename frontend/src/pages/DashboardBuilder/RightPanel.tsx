import React, { useState } from 'react';
import { useDashboardStore, Widget } from '../../store/dashboardStore';
import {
    BarChart, TrendingUp, PieChart, FileText,
    Settings, Trash2, ChevronRight, Check, LayoutDashboard
} from 'lucide-react';

const RightPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'Visuals' | 'Data' | 'Format'>('Visuals');
    const {
        selectedWidgetId,
        widgets,
        updateWidget,
        deleteWidget,
        addWidget,
        datasetSchema
    } = useDashboardStore();

    const selectedWidget = widgets.find(w => w.id === selectedWidgetId);

    return (
        <div className="w-[320px] bg-white border-l border-slate-200 flex flex-col h-full shadow-2xl z-40 relative">
            {/* Nav Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1">
                {(['Visuals', 'Data', 'Format'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 flex flex-col items-center py-2.5 rounded-lg transition-all ${activeTab === tab
                            ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                            : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {tab === 'Visuals' && <LayoutDashboard size={14} strokeWidth={2.5} />}
                        {tab === 'Data' && <FileText size={14} strokeWidth={2.5} />}
                        {tab === 'Format' && <Settings size={14} strokeWidth={2.5} />}
                        <span className="text-[9px] font-black uppercase tracking-[0.1em] mt-1">{tab}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {activeTab === 'Visuals' && (
                    <div className="space-y-6">
                        <div className="space-y-1">
                            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Visualizations</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Select a type to add to canvas</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { type: 'line', icon: TrendingUp, label: 'LINE' },
                                { type: 'bar', icon: BarChart, label: 'BAR' },
                                { type: 'pie', icon: PieChart, label: 'PIE' },
                                { type: 'kpi', icon: FileText, label: 'CARD' },
                            ].map(v => (
                                <button
                                    key={v.type}
                                    onClick={() => {
                                        if (selectedWidget) {
                                            updateWidget(selectedWidget.id, { type: v.type });
                                        } else {
                                            addWidget(v.type);
                                        }
                                    }}
                                    className={`group aspect-square flex items-center justify-center border-2 rounded-xl transition-all active:scale-90 ${selectedWidget?.type === v.type
                                        ? 'border-indigo-600 bg-indigo-50 shadow-inner'
                                        : 'border-slate-50 hover:border-indigo-500 hover:bg-indigo-50'
                                        }`}
                                    title={v.label}
                                >
                                    <v.icon
                                        size={20}
                                        className={`${selectedWidget?.type === v.type ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-600'}`}
                                        strokeWidth={2.2}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'Data' && (
                    <div className="space-y-6">
                        {!selectedWidget ? (
                            <div className="py-20 text-center text-slate-300">
                                <FileText size={40} className="mx-auto mb-4 opacity-20" />
                                <p className="text-[10px] font-black uppercase tracking-widest leading-loose">Select a visual to<br />configure data fields</p>
                            </div>
                        ) : (
                            <div className="space-y-8 animate-in slide-in-from-right-2">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Main Dataset</label>
                                    <select
                                        value={selectedWidget.dataset}
                                        onChange={(e) => updateWidget(selectedWidget.id, { dataset: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all appearance-none"
                                    >
                                        {Object.keys(datasetSchema).map(ds => <option key={ds} value={ds}>{ds}</option>)}
                                    </select>
                                </div>

                                {['xField', 'yField'].map(field => (
                                    <div key={field} className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            {field === 'xField' ? 'Axis / Dimension' : 'Values / Measures'}
                                        </label>
                                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                            {datasetSchema[selectedWidget.dataset]?.map(f => (
                                                <button
                                                    key={f}
                                                    onClick={() => updateWidget(selectedWidget.id, { [field]: f })}
                                                    className={`w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold rounded-lg transition-all ${selectedWidget[field as keyof Widget] === f
                                                        ? 'bg-indigo-600 text-white shadow-lg'
                                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                        }`}
                                                >
                                                    <span>{f}</span>
                                                    {selectedWidget[field as keyof Widget] === f && <Check size={12} strokeWidth={3} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aggregation Level</label>
                                    <div className="flex gap-2">
                                        {['sum', 'avg', 'count'].map(agg => (
                                            <button
                                                key={agg}
                                                onClick={() => updateWidget(selectedWidget.id, { aggregation: agg as any })}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${selectedWidget.aggregation === agg ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                    }`}
                                            >
                                                {agg}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'Format' && (
                    <div className="space-y-6">
                        {!selectedWidget ? (
                            <div className="py-20 text-center text-slate-300">
                                <Settings size={40} className="mx-auto mb-4 opacity-20" />
                                <p className="text-[10px] font-black uppercase tracking-widest leading-loose">Select a visual to<br />format properties</p>
                            </div>
                        ) : (
                            <div className="space-y-8 animate-in slide-in-from-right-2">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Visual Title</label>
                                    <input
                                        type="text"
                                        value={selectedWidget.title}
                                        onChange={(e) => updateWidget(selectedWidget.id, { title: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all font-mono"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Show Legend</span>
                                        <button
                                            onClick={() => updateWidget(selectedWidget.id, { properties: { ...selectedWidget.properties, showLegend: !selectedWidget.properties.showLegend } })}
                                            className={`w-10 h-5 rounded-full transition-all flex items-center px-1 ${selectedWidget.properties.showLegend ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'}`}
                                        >
                                            <div className="w-3.5 h-3.5 bg-white rounded-full shadow-sm" />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Gridlines</span>
                                        <button
                                            onClick={() => updateWidget(selectedWidget.id, { properties: { ...selectedWidget.properties, showGridlines: !selectedWidget.properties.showGridlines } })}
                                            className={`w-10 h-5 rounded-full transition-all flex items-center px-1 ${selectedWidget.properties.showGridlines ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'}`}
                                        >
                                            <div className="w-3.5 h-3.5 bg-white rounded-full shadow-sm" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <Settings size={10} /> Color Theme
                                    </label>
                                    <div className="grid grid-cols-4 gap-3 text-white">
                                        {['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#744EC2', '#D9B300', '#065A82'].map(c => (
                                            <button
                                                key={c}
                                                onClick={() => updateWidget(selectedWidget.id, { properties: { ...selectedWidget.properties, colorTheme: c } })}
                                                className={`aspect-square rounded-xl border-4 transition-all hover:scale-110 active:scale-90 ${selectedWidget.properties.colorTheme === c ? 'border-white ring-4 ring-indigo-100 shadow-lg' : 'border-transparent opacity-80'}`}
                                                style={{ backgroundColor: c }}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={() => deleteWidget(selectedWidget.id)}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors mt-12"
                                >
                                    <Trash2 size={14} /> Remove Visual
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Selection Status Bar */}
            {selectedWidget && (
                <div className="p-4 bg-indigo-600 text-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom-5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                            <LayoutDashboard size={14} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-wider opacity-60">Editing {selectedWidget.type}</p>
                            <p className="text-[11px] font-bold truncate">{selectedWidget.title}</p>
                        </div>
                        <ChevronRight size={14} className="opacity-40" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default RightPanel;
