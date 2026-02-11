import React from 'react';
import Icon from './Icon';

interface StatCardProps {
    title: string;
    value: string;
    icon?: string;
    trend?: string;
    trendLabel?: string;
    color?: 'emerald' | 'rose' | 'amber' | 'blue' | 'indigo' | 'slate' | 'cyan' | 'purple';
    className?: string;
    onClick?: () => void;
    subValue?: string;
}

const colorMap: Record<string, { bg: string, text: string, border: string, iconBg: string, shadow: string }> = {
    emerald: { bg: 'bg-emerald-50/30', text: 'text-emerald-600', border: 'border-emerald-400', iconBg: 'bg-emerald-100', shadow: 'shadow-emerald-100' },
    rose: { bg: 'bg-rose-50/30', text: 'text-rose-600', border: 'border-rose-400', iconBg: 'bg-rose-100', shadow: 'shadow-rose-100' },
    amber: { bg: 'bg-amber-50/30', text: 'text-amber-600', border: 'border-amber-400', iconBg: 'bg-amber-100', shadow: 'shadow-amber-100' },
    blue: { bg: 'bg-blue-50/30', text: 'text-blue-600', border: 'border-blue-400', iconBg: 'bg-blue-100', shadow: 'shadow-blue-100' },
    indigo: { bg: 'bg-indigo-50/30', text: 'text-indigo-600', border: 'border-indigo-400', iconBg: 'bg-indigo-100', shadow: 'shadow-indigo-100' },
    slate: { bg: 'bg-slate-50/30', text: 'text-slate-600', border: 'border-slate-400', iconBg: 'bg-slate-100', shadow: 'shadow-slate-100' },
    cyan: { bg: 'bg-cyan-50/30', text: 'text-cyan-600', border: 'border-cyan-400', iconBg: 'bg-cyan-100', shadow: 'shadow-cyan-100' },
    purple: { bg: 'bg-purple-50/30', text: 'text-purple-600', border: 'border-purple-400', iconBg: 'bg-purple-100', shadow: 'shadow-purple-100' },
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, trendLabel = 'vs last period', color = 'slate', className = '', onClick, subValue }) => {
    const theme = colorMap[color] || colorMap.slate;

    return (
        <div
            onClick={onClick}
            className={`bg-white rounded-xl border-2 ${theme.border} ${theme.shadow} ${theme.bg} p-6 flex flex-col justify-between hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default ${className}`}
        >
            <div className="flex justify-between items-start">
                <div>

                    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{value}</h3>
                    {subValue && <p className="text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">{subValue}</p>}
                </div>
                {icon && (
                    <div className={`p-2 rounded-lg ${theme.iconBg}`}>
                        <Icon name={icon as any} className={`w-5 h-5 ${theme.text}`} />
                    </div>
                )}
            </div>

            {(trend) && (
                <div className="flex items-center mt-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend.startsWith('+') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {trend}
                    </span>
                    <span className="text-xs text-slate-400 ml-2 font-medium">{trendLabel}</span>
                </div>
            )}
        </div>
    );
};

export default StatCard;
