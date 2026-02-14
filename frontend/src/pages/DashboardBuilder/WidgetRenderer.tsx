import React from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';
import { Widget, useDashboardStore } from '../../store/dashboardStore';
import { MoreHorizontal, Maximize2, Filter, Info, Download, Share2, Trash2 } from 'lucide-react';
import { confirm, showSuccess } from '../../utils/toast';


interface WidgetRendererProps {
    widget: Widget;
    data: any[];
}

// Power BI Default "Executive" Palette
const PBI_PALETTE = [
    '#118DFF', // Cyan Blue
    '#12239E', // Royal Blue
    '#E66C37', // Orange
    '#6B007B', // Purple
    '#E044A7', // Pink
    '#744EC2', // Lavender
    '#D9B300', // Gold
    '#065A82', // Dark Teal
];

const WidgetRenderer: React.FC<WidgetRendererProps> = ({ widget, data }) => {
    const { setGlobalFilters, selectedWidgetId, deleteWidget, selectWidget } = useDashboardStore();
    const isSelected = selectedWidgetId === widget.id;

    const handleChartClick = (entry: any) => {
        if (!entry) return;
        const payload = entry.activePayload?.[0]?.payload || entry;

        // Cross-filtering logic
        if (widget.dataset === 'Sales' && widget.xField === 'Customer') {
            setGlobalFilters({ customer: payload.Customer || payload.name });
        } else if (widget.dataset === 'Expenses' && widget.xField === 'Vendor') {
            setGlobalFilters({ vendor: payload.Vendor || payload.name });
        }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900 text-white p-3 rounded-lg shadow-2xl border border-slate-700 min-w-[140px] animate-in fade-in zoom-in duration-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-bold">{payload[0].name}:</span>
                        <span className="text-xs font-black text-indigo-400">
                            {widget.properties.numberFormat === 'Currency' ? `₹${payload[0].value.toLocaleString()}` : payload[0].value}
                        </span>
                    </div>
                </div>
            );
        }
        return null;
    };

    const renderKPI = () => {
        const total = data.reduce((acc, curr) => acc + (curr[widget.yField || 'Amount'] || 0), 0);
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <h2 className="text-5xl font-black text-slate-800 tracking-tighter mb-1">
                    {widget.properties.numberFormat === 'Currency' ? `₹${total.toLocaleString()}` : total}
                </h2>
                <div className="flex items-center gap-3">
                    <div className="h-px w-8 bg-slate-200" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 whitespace-nowrap">
                        {widget.aggregation} of {widget.yField}
                    </span>
                    <div className="h-px w-8 bg-slate-200" />
                </div>
            </div>
        );
    };

    const renderVisual = () => {
        const chartColor = widget.properties.colorTheme || PBI_PALETTE[0];

        switch (widget.type) {
            case 'line':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} onClick={handleChartClick}>
                            <defs>
                                <linearGradient id={`color-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.1} />
                                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            {widget.properties.showGridlines && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
                            <XAxis
                                dataKey={widget.xField}
                                fontSize={9}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#94a3b8', fontWeight: 700 }}
                                dy={10}
                            />
                            <YAxis
                                fontSize={9}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#94a3b8', fontWeight: 700 }}
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
                            <Area
                                type="monotone"
                                dataKey={widget.yField || 'Amount'}
                                stroke={chartColor}
                                strokeWidth={3}
                                fillOpacity={1}
                                fill={`url(#color-${widget.id})`}
                                animationDuration={1500}
                                activeDot={{ r: 6, strokeWidth: 0, fill: chartColor }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                );
            case 'bar':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} onClick={handleChartClick}>
                            {widget.properties.showGridlines && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
                            <XAxis dataKey={widget.xField} fontSize={9} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontWeight: 700 }} dy={10} />
                            <YAxis
                                fontSize={9}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#94a3b8', fontWeight: 700 }}
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                            <Bar
                                dataKey={widget.yField || 'Amount'}
                                fill={chartColor}
                                radius={[4, 4, 0, 0]}
                                barSize={32}
                                animationDuration={1500}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                );
            case 'pie':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                innerRadius="65%"
                                outerRadius="85%"
                                paddingAngle={4}
                                dataKey={widget.yField || 'Amount'}
                                nameKey={widget.xField || 'name'}
                                onClick={handleChartClick}
                                animationDuration={1500}
                            >
                                {data.map((entry, index) => <Cell key={index} fill={PBI_PALETTE[index % PBI_PALETTE.length]} stroke="none" />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            {widget.properties.showLegend && (
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: '20px' }}
                                />
                            )}
                        </PieChart>
                    </ResponsiveContainer>
                );
            case 'kpi':
                return renderKPI();
            default:
                return null;
        }
    };

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                selectWidget(widget.id);
            }}
            className={`w-full h-full bg-white flex flex-col group transition-all duration-500 rounded-2xl ${isSelected ? 'shadow-[0_25px_60px_rgba(17,141,255,0.2)] ring-2 ring-indigo-600' : 'shadow-sm border border-slate-100 hover:border-slate-300'} cursor-pointer`}
        >
            {/* Power BI Header Refined */}
            <div className="h-11 px-5 flex items-center justify-between border-b border-slate-50 bg-white select-none rounded-t-2xl">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] truncate flex-1 leading-tight">
                    {widget.title}
                </h3>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (await confirm('Are you sure you want to remove this visual?')) {
                                deleteWidget(widget.id);
                                showSuccess('Visual removed');
                            }
                        }}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remove Visual"
                    >
                        <Trash2 size={13} strokeWidth={2.5} />
                    </button>

                    <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                        <Filter size={13} strokeWidth={2.5} />
                    </button>
                    <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400">
                        <MoreHorizontal size={13} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6 min-h-0 relative">
                {renderVisual()}
            </div>
        </div>
    );
};

export default WidgetRenderer;
