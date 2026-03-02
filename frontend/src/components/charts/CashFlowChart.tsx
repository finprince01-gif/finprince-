import React from 'react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface CashFlowData {
    period: string;
    inflow: number;
    outflow: number;
}

interface CashFlowChartProps {
    data: CashFlowData[];
    height?: number | string;
}

const CashFlowChart: React.FC<CashFlowChartProps> = ({ data, height = 300 }) => {
    // Calculate net cash for the line
    const processedData = data.map(d => ({
        ...d,
        netCash: d.inflow - d.outflow
    }));

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <ComposedChart data={processedData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
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
                        tickFormatter={(val) => `₹${val / 1000}k`}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            name === 'inflow' ? 'Cash In' : name === 'outflow' ? 'Cash Out' : 'Net Cash'
                        ]}
                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}
                        cursor={{ fill: '#f8fafc' }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="inflow" name="Cash In" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} fillOpacity={0.9} />
                    <Bar dataKey="outflow" name="Cash Out" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={12} fillOpacity={0.9} />
                    <Line
                        type="monotone"
                        dataKey="netCash"
                        name="Net Cash"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3, strokeWidth: 2, fill: 'white', stroke: '#3b82f6' }}
                        activeDot={{ r: 5 }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CashFlowChart;
