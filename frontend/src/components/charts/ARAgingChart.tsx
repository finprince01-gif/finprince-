import React from 'react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface AgingData {
    range: string;
    amount: number;
}

interface ARAgingChartProps {
    data: AgingData[];
    height?: number | string;
}

// Map ranges to colors based on severity
const getBarColor = (range: string) => {
    if (range.includes('0-30') || range.includes('<30')) return '#10b981'; // Green
    if (range.includes('30-60') || range.includes('31-60')) return '#f59e0b'; // Amber
    if (range.includes('60-90') || range.includes('61-90')) return '#f97316'; // Orange
    return '#ef4444'; // Red for 90+
};

const ARAgingChart: React.FC<ARAgingChartProps> = ({ data, height = 300 }) => {
    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <BarChart
                    layout="vertical"
                    data={data}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#e2e8f0" />
                    <XAxis type="number" hide />
                    <YAxis
                        type="category"
                        dataKey="range"
                        width={60}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        cursor={{ fill: '#f8fafc', radius: 4 }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px 12px' }}
                        formatter={(value: number) => [formatCurrency(value), 'Outstanding']}
                        itemStyle={{ color: '#1e293b', fontSize: '12px', fontWeight: 600 }}
                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 500, marginBottom: 4 }}
                    />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={24} name="Amount">
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.range)} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ARAgingChart;
