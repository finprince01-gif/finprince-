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

const colorMap: Record<string, { accent: string; iconBg: string; iconColor: string }> = {
    emerald: { accent: '#059669', iconBg: '#ECFDF5', iconColor: '#059669' },
    rose: { accent: '#E11D48', iconBg: '#FFF1F2', iconColor: '#E11D48' },
    amber: { accent: '#D97706', iconBg: '#FFFBEB', iconColor: '#D97706' },
    blue: { accent: '#2563EB', iconBg: '#EFF6FF', iconColor: '#2563EB' },
    indigo: { accent: '#4F46E5', iconBg: '#EEF2FF', iconColor: '#4F46E5' },
    slate: { accent: '#475569', iconBg: '#F1F5F9', iconColor: '#475569' },
    cyan: { accent: '#0891B2', iconBg: '#ECFEFF', iconColor: '#0891B2' },
    purple: { accent: '#9333EA', iconBg: '#FAF5FF', iconColor: '#9333EA' },
};

const StatCard: React.FC<StatCardProps> = ({
    title, value, icon, trend, trendLabel = 'vs last period',
    color = 'indigo', className = '', onClick, subValue
}) => {
    const theme = colorMap[color] || colorMap.indigo;

    return (
        <div
            onClick={onClick}
            className={`erp-kpi-card group ${onClick ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1' : ''} ${className}`}
            style={{
                borderColor: theme.accent,
                borderWidth: '1.5px',
                borderStyle: 'solid'
            }}
        >
            {/* Top Row */}
            <div className="flex justify-between items-start">
                <div>
                    <p className="erp-kpi-label mb-2">
                        {title}
                    </p>
                    <h3 className="erp-kpi-value">
                        {value}
                    </h3>
                    {subValue && (
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">
                            {subValue}
                        </p>
                    )}
                </div>

                {icon && (
                    <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                        style={{ background: theme.iconBg }}
                    >
                        <Icon
                            name={icon as any}
                            className="w-6 h-6"
                            style={{ color: theme.iconColor }}
                        />
                    </div>
                )}
            </div>

            {/* Trend Row */}
            {(trend || trendLabel) && (
                <div className="flex items-center mt-6 pt-4 border-t border-slate-50">
                    {trend && (
                        <span className={`erp-badge ${trend.startsWith('+') ? 'erp-badge-success' : 'erp-badge-danger'}`}>
                            {trend}
                        </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider ml-2">
                        {trendLabel}
                    </span>
                </div>
            )}
        </div>
    );
};

export default StatCard;
