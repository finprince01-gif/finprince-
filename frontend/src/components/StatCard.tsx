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
            style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                cursor: onClick ? 'pointer' : 'default',
            }}
            className={`dark:bg-slate-900 dark:border-slate-800 hover:border-[#C7D2FE] hover:shadow-lg dark:hover:bg-slate-800 transition-all ${className}`}
        >
            {/* Top Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p
                        style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#64748B',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            marginBottom: '8px',
                        }}
                        className="dark:text-slate-400"
                    >
                        {title}
                    </p>
                    <h3
                        style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#1F2937',
                            letterSpacing: '-0.02em',
                            lineHeight: '1',
                        }}
                        className="dark:text-slate-100"
                    >
                        {value}
                    </h3>
                    {subValue && (
                        <p
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#94A3B8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginTop: '4px',
                            }}
                            className="dark:text-slate-500"
                        >
                            {subValue}
                        </p>
                    )}
                </div>

                {icon && (
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: theme.iconBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                        className="dark:bg-slate-800"
                    >
                        <Icon
                            name={icon as any}
                            className="w-5 h-5"
                            style={{ color: theme.iconColor }}
                        />
                    </div>
                )}
            </div>

            {/* Trend Row */}
            {trend && (
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px' }}>
                    <span
                        style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: trend.startsWith('+') ? '#ECFDF5' : '#FFF1F2',
                            color: trend.startsWith('+') ? '#059669' : '#E11D48',
                            letterSpacing: '0.03em',
                        }}
                    >
                        {trend}
                    </span>
                    <span
                        style={{
                            fontSize: '11px',
                            color: '#94A3B8',
                            fontWeight: 500,
                            marginLeft: '8px',
                        }}
                        className="dark:text-slate-500"
                    >
                        {trendLabel}
                    </span>
                </div>
            )}
        </div>
    );
};

export default StatCard;
