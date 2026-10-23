import React from 'react';
import { cn } from '@/utils/cn';
import { TaskStatus, TaskPriority } from '@/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';
  status?: TaskStatus;
  priority?: TaskPriority;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'default',
  status,
  priority,
  size = 'md',
  dot = false,
  ...props
}) => {
  // Determine styling based on status or priority if provided
  let styleClasses = 'bg-slate-100 text-slate-700 border-slate-200/80';
  let dotColor = 'bg-slate-400';

  if (status) {
    switch (status) {
      case 'TODO':
        styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        dotColor = 'bg-slate-400';
        break;
      case 'IN_PROGRESS':
        styleClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        dotColor = 'bg-blue-500';
        break;
      case 'COMPLETED':
        styleClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotColor = 'bg-emerald-500';
        break;
    }
  } else if (priority) {
    switch (priority) {
      case 'LOW':
        styleClasses = 'bg-sky-50 text-sky-700 border-sky-200';
        dotColor = 'bg-sky-500';
        break;
      case 'MEDIUM':
        styleClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        dotColor = 'bg-amber-500';
        break;
      case 'HIGH':
        styleClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        dotColor = 'bg-rose-500';
        break;
    }
  } else {
    switch (variant) {
      case 'primary':
        styleClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        dotColor = 'bg-indigo-500';
        break;
      case 'success':
        styleClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotColor = 'bg-emerald-500';
        break;
      case 'warning':
        styleClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        dotColor = 'bg-amber-500';
        break;
      case 'danger':
        styleClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        dotColor = 'bg-rose-500';
        break;
      case 'outline':
        styleClasses = 'bg-transparent text-slate-600 border-slate-300';
        dotColor = 'bg-slate-400';
        break;
      default:
        styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        dotColor = 'bg-slate-400';
        break;
    }
  }

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-0.5 gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border tracking-wide select-none',
        styleClasses,
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />}
      {children || status || priority}
    </span>
  );
};
