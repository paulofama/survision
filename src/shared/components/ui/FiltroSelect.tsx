// ============================================
// COMPONENTE: FiltroSelect
// Selector dropdown moderno con label e icono
// Reutilizable en todo el sistema
// ============================================
// RUTA: src/components/ui/FiltroSelect.tsx
// ============================================

import React from 'react';

export interface FiltroSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const FiltroSelect: React.FC<FiltroSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Todos',
  icon,
  disabled = false,
  className = ''
}) => (
  <div className={`flex flex-col group ${className}`}>
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
      {icon}
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white 
                 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                 disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400
                 transition-all duration-200 hover:border-slate-300
                 shadow-sm appearance-none cursor-pointer"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

export default FiltroSelect;
