import React from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

/**
 * ChartWidget Component
 * 
 * Wrapper for Recharts components with consistent styling.
 */

interface ChartWidgetProps {
    type: 'bar' | 'line' | 'pie';
    data: any[];
    xKey: string;
    yKey: string;
    title?: string;
    height?: number;
    colors?: string[];
}

const DEFAULT_COLORS = [
    '#3b82f6', // blue-500
    '#10b981', // green-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#f97316', // orange-500
];

const ChartWidget: React.FC<ChartWidgetProps> = ({
    type,
    data,
    xKey,
    yKey,
    title,
    height = 300,
    colors = DEFAULT_COLORS
}) => {
    if (!data || data.length === 0) {
        return (
            <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
                <div className="flex items-center justify-center h-64 text-gray-400">
                    No data available for chart
                </div>
            </div>
        );
    }

    const renderChart = () => {
        // Fix for "width(-1) and height(-1)" error: 
        // Ensure parent has relative/absolute positioning and defined dimensions.
        // ResponsiveContainer expects the parent to have a defined size.
        return (
            <div style={{ width: '100%', height: height, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    {type === 'bar' ? (
                        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey={xKey}
                                tick={{ fontSize: 12 }}
                                stroke="#6b7280"
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                stroke="#6b7280"
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '0.375rem'
                                }}
                            />
                            <Legend />
                            <Bar dataKey={yKey} fill={colors[0]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    ) : type === 'line' ? (
                        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey={xKey}
                                tick={{ fontSize: 12 }}
                                stroke="#6b7280"
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                stroke="#6b7280"
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '0.375rem'
                                }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey={yKey}
                                stroke={colors[0]}
                                strokeWidth={2}
                                dot={{ fill: colors[0], r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    ) : (
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey={yKey}
                                nameKey={xKey}
                                cx="50%"
                                cy="50%"
                                outerRadius={Math.min(height, 300) / 2 - 40}
                                label={(entry) => `${entry[xKey]}: ${entry[yKey]}`}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '0.375rem'
                                }}
                            />
                            <Legend />
                        </PieChart>
                    )}
                </ResponsiveContainer>
            </div>
        );
    };

    return (
        <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200" style={{ minWidth: 0 }}>
            {title && (
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
            )}
            {renderChart()}
        </div>
    );
};

export default ChartWidget;

