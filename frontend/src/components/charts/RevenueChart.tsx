import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface RevenueData {
    period: string;
    revenue: number;
    target?: number;
    previous?: number;
}

interface RevenueChartProps {
    data: RevenueData[];
    height?: number | string;
}

const RevenueChart: React.FC<RevenueChartProps> = ({ data, height = 300 }) => {
    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                        dataKey="period"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(value) => `₹${value / 1000}k`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                        itemStyle={{ color: '#10b981', fontSize: '12px', fontWeight: 600 }}
                        formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                        labelStyle={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        activeDot={{ r: 6, strokeWidth: 0, fill: '#059669' }}
                    />
                    {/* Optional Comparison Line (e.g. Target) */}
                    {data.some(d => d.target !== undefined) && (
                        <Area
                            type="monotone" // or standard line
                            dataKey="target"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            fillOpacity={0}
                            fill="none"
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default RevenueChart;
