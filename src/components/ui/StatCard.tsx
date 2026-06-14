// ============================================
// COMPONENTE: StatCard
// Tarjeta de estadística moderna con variantes
// Reutilizable en todo el sistema
// ============================================
// RUTA: src/components/ui/StatCard.tsx
// ============================================

import React from 'react';

export type StatCardVariant = 'blue' | 'emerald' | 'violet' | 'amber' | 'slate' | 'rose' | 'cyan' | 'orange';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: StatCardVariant;
  className?: string;
  onClick?: () => void;
}

const variants: Record<StatCardVariant, {
  bg: string;
  border: string;
  iconBg: string;
  text: string;
  valueText: string;
}> = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50',
    border: 'border-blue-200/60',
    iconBg: 'bg-blue-500',
    text: 'text-blue-700',
    valueText: 'text-blue-900'
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50',
    border: 'border-emerald-200/60',
    iconBg: 'bg-emerald-500',
    text: 'text-emerald-700',
    valueText: 'text-emerald-900'
  },
  violet: {
    bg: 'bg-gradient-to-br from-violet-50 to-violet-100/50',
    border: 'border-violet-200/60',
    iconBg: 'bg-violet-500',
    text: 'text-violet-700',
    valueText: 'text-violet-900'
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50',
    border: 'border-amber-200/60',
    iconBg: 'bg-amber-500',
    text: 'text-amber-700',
    valueText: 'text-amber-900'
  },
  slate: {
    bg: 'bg-gradient-to-br from-slate-50 to-slate-100/50',
    border: 'border-slate-200/60',
    iconBg: 'bg-slate-500',
    text: 'text-slate-600',
    valueText: 'text-slate-900'
  },
  rose: {
    bg: 'bg-gradient-to-br from-rose-50 to-rose-100/50',
    border: 'border-rose-200/60',
    iconBg: 'bg-rose-500',
    text: 'text-rose-700',
    valueText: 'text-rose-900'
  },
  cyan: {
    bg: 'bg-gradient-to-br from-cyan-50 to-cyan-100/50',
    border: 'border-cyan-200/60',
    iconBg: 'bg-cyan-500',
    text: 'text-cyan-700',
    valueText: 'text-cyan-900'
  },
  orange: {
    bg: 'bg-gradient-to-br from-orange-50 to-orange-100/50',
    border: 'border-orange-200/60',
    iconBg: 'bg-orange-500',
    text: 'text-orange-700',
    valueText: 'text-orange-900'
  }
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'blue',
  className = '',
  onClick
}) => {
  const v = variants[variant];

  return (
    <div 
      className={`
        relative overflow-hidden rounded-2xl border ${v.border} ${v.bg}
        p-5 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]
        group ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}
      `}
      onClick={onClick}
    >
      {/* Decorative element */}
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/40 blur-2xl" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-xs font-semibold uppercase tracking-wider ${v.text} mb-2`}>
            {title}
          </p>
          <p className={`text-3xl font-bold ${v.valueText} tracking-tight`}>
            {typeof value === 'number' ? value.toLocaleString('es-AR') : value}
          </p>
          {subtitle && (
            <p className={`text-xs ${v.text} mt-1.5 opacity-80`}>
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div className={`
            ${v.iconBg} p-2.5 rounded-xl text-white shadow-lg
            transform transition-transform group-hover:scale-110 group-hover:rotate-3
          `}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
