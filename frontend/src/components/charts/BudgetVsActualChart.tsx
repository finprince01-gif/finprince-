import React from 'react';
import {
    ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface BudgetData {
    period: string;
    actual: number;
    budget: number;
}

interface BudgetVsActualChartProps {
    data: BudgetData[];
    height?: number | string;
}

const BudgetVsActualChart: React.FC<BudgetVsActualChartProps> = ({ data, height = 300 }) => {
    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                        width={40}
                        tickFormatter={(val) => `₹${val / 1000}k`}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number, name: string) => [formatCurrency(value), name === 'actual' ? 'Actual' : 'Budget']}
                        labelStyle={{ color: '#64748b', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}
                        cursor={{ fill: '#f8fafc' }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar
                        dataKey="actual"
                        barSize={24}
                        radius={[4, 4, 0, 0]}
                        name="Actual"
                        fillOpacity={0.9}
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.actual > entry.budget ? '#ef4444' : '#10b981'} // Red if over budget, Green if under (or blue/premium color)
                            />
                        ))}
                    </Bar>
                    <Line
                        type="monotone"
                        dataKey="budget"
                        stroke="#64748b"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#64748b', strokeWidth: 2, stroke: 'white' }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        name="Budget"
                        strokeDasharray="5 5"
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export default BudgetVsActualChart;
