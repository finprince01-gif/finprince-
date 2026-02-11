import React from 'react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface WaterfallData {
    name: string;
    value: number;
    isTotal?: boolean; // For Revenue, GP, NP (Bars starting from 0)
}

interface WaterfallChartProps {
    data: WaterfallData[];
    height?: number | string;
}

const WaterfallChart: React.FC<WaterfallChartProps> = ({ data, height = 300 }) => {
    // Process data into stacked bar format logic
    let cumulative = 0;
    const processedData = data.map(d => {
        const value = d.value;
        const isTotal = d.isTotal || false;

        let start = 0;
        let barSize = 0;
        let color = '#3b82f6'; // Default (Totals)

        if (isTotal) {
            start = 0;
            barSize = value;
            cumulative = value; // Reset/Set checkpoint
            color = '#3b82f6'; // Blue
        } else {
            // Step
            if (value >= 0) {
                // Increase (e.g. Other Income)
                start = cumulative;
                barSize = value;
                cumulative += value;
                color = '#10b981'; // Green
            } else {
                // Decrease (e.g. Expense)
                start = cumulative + value; // e.g. 100 + (-20) = 80. Start at 80.
                barSize = Math.abs(value); // Height 20. Bar goes 80->100
                cumulative += value; // 80
                color = '#ef4444'; // Red
            }
        }

        return {
            name: d.name,
            barVal: barSize, // The visible bar height
            placeholder: start, // The invisible bar height
            actualValue: d.value, // For tooltip
            color,
            isTotal
        };
    });

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <BarChart data={processedData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(val) => `₹${val / 1000}k`}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px 12px' }}
                        cursor={{ fill: '#f8fafc' }}
                        formatter={(value: number, name: string, props: any) => {
                            if (name === 'placeholder') return [null, null]; // Hide placeholder
                            // Using payload.actualValue for correct sign
                            return [formatCurrency(props.payload.actualValue), 'Amount'];
                        }}
                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 600, marginBottom: 4 }}
                    />
                    {/* Placeholder Bar (Transparent stack base) */}
                    <Bar dataKey="placeholder" stackId="a" fill="transparent" isAnimationActive={false} />
                    {/* Visible Bar (Stacked on top) */}
                    <Bar dataKey="barVal" stackId="a" radius={[4, 4, 4, 4]} name="Amount">
                        {processedData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default WaterfallChart;
