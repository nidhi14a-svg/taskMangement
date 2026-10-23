'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Plus,
  Bell,
  Search,
  User as UserIcon,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/common/Button';

export interface HeaderProps {
  onToggleMobileNav?: () => void;
  onCreateTask?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileNav,
  onCreateTask,
}) => {
  const pathname = usePathname();
  const currentPath = pathname || '';

  const getPageTitle = () => {
    if (currentPath.includes('/dashboard')) return 'Dashboard';
    if (currentPath.includes('/tasks')) return 'Task Management';
    if (currentPath.includes('/board')) return 'Kanban Board';
    return 'TaskFlow';
  };

  const getPageSubtitle = () => {
    if (currentPath.includes('/dashboard')) return 'System metrics, completion rates, and project overview';
    if (currentPath.includes('/tasks')) return 'Manage, prioritize, and filter your team deliverables';
    if (currentPath.includes('/board')) return 'Visual lifecycle workflow: TODO, IN_PROGRESS, and COMPLETED';
    return 'Production Task Management System';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 select-none">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onToggleMobileNav}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page Title & Subtitle */}
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
            {getPageTitle()}
          </h1>
          <p className="text-xs text-slate-400 hidden sm:block leading-none mt-0.5">
            {getPageSubtitle()}
          </p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Create Task button */}
        <Button
          variant="primary"
          size="sm"
          onClick={onCreateTask}
          className="flex items-center gap-1.5 shadow-sm font-semibold"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Task</span>
        </Button>

        {/* Notification Bell */}
        <button
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-600 rounded-full ring-2 ring-white" />
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

        {/* User Menu Link */}
        <Link
          href="/login"
          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
          title="User Account"
        >
          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs">
            <UserIcon className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <span className="text-xs font-semibold text-slate-700 hidden md:inline">
            Alex
          </span>
        </Link>
      </div>
    </header>
  );
};
