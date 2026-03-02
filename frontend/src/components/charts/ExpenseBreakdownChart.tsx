import React, { useMemo } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface ExpenseData {
    name: string;
    value: number;
}

interface ExpenseBreakdownChartProps {
    data: ExpenseData[];
    height?: number | string;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const ExpenseBreakdownChart: React.FC<ExpenseBreakdownChartProps> = ({ data, height = 300 }) => {
    const processedData = useMemo(() => {
        if (!data || data.length === 0) return [];
        const sorted = [...data].sort((a, b) => b.value - a.value);
        if (sorted.length <= 5) return sorted;

        const top5 = sorted.slice(0, 5);
        const others = sorted.slice(5).reduce((acc, curr) => acc + curr.value, 0);
        return [...top5, { name: 'Others', value: others }];
    }, [data]);

    const total = processedData.reduce((acc, curr) => acc + curr.value, 0);

    if (processedData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No expense data available
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height, position: 'relative' }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8 sm:pb-0">
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total</span>
                <span className="text-xl font-bold text-slate-800 tracking-tight">
                    {new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0,
                        notation: "compact",
                        compactDisplay: "short"
                    }).format(total)}
                </span>
            </div>

            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={processedData as any[]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        stroke="none"
                        cornerRadius={4}
                    >
                        {processedData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number) => [formatCurrency(value), 'Amount']}
                        itemStyle={{ color: '#1e293b', fontSize: '12px', fontWeight: 600 }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '8px 12px' }}
                        separator=": "
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        formatter={(value, entry: any) => {
                            const { payload } = entry;
                            const percent = (payload.value / (total || 1)) * 100;
                            return (
                                <span className="text-slate-600 font-medium ml-1">
                                    {value} <span className="text-slate-400 font-normal">({percent.toFixed(0)}%)</span>
                                </span>
                            );
                        }}
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ExpenseBreakdownChart;
