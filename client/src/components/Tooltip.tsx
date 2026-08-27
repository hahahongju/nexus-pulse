import React, { ReactNode } from 'react';

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  if (!content) return <>{children}</>;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 border-y-transparent border-l-transparent',
  };

  return (
    <div className={`relative inline-flex items-center group/tooltip ${className}`}>
      {children}
      <div
        className={`pointer-events-none absolute ${positionClasses[position]} z-50 hidden group-hover/tooltip:flex flex-col items-center animate-fade-in`}
      >
        <div className="px-2.5 py-1 rounded bg-slate-950/95 border border-cyan-500/50 shadow-[0_0_12px_rgba(0,240,255,0.3)] text-[11px] font-mono text-cyan-200 whitespace-nowrap backdrop-blur-md">
          {content}
        </div>
        <div className={`w-0 h-0 border-4 ${arrowClasses[position]}`} />
      </div>
    </div>
  );
};
