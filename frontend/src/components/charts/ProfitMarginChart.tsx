import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

interface ProfitMarginData {
    period: string;
    margin: number; // Percentage value (e.g., 25.5 for 25.5%)
}

interface ProfitMarginChartProps {
    data: ProfitMarginData[];
    height?: number | string;
}

const ProfitMarginChart: React.FC<ProfitMarginChartProps> = ({ data, height = 300 }) => {
    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
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
                        tickFormatter={(val) => `${val}%`}
                        domain={['auto', 'auto']}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Net Margin']}
                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Line
                        type="monotone"
                        dataKey="margin"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: 'white' }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ProfitMarginChart;
