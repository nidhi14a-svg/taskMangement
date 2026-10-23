'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Plus,
  Bell,
  User as UserIcon,
  LogOut,
  Shield,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/hooks/useAuth';

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
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
    if (currentPath.includes('/dashboard')) return 'Dashboard';
    if (currentPath.includes('/tasks')) return 'Task Management';
    if (currentPath.includes('/board')) return 'Kanban Board';
    return 'TaskFlow';
  };

  const getPageSubtitle = () => {
    if (currentPath.includes('/dashboard'))
      return 'System metrics, completion rates, and project overview';
    if (currentPath.includes('/tasks'))
      return 'Manage, prioritize, and filter your team deliverables';
    if (currentPath.includes('/board'))
      return 'Visual lifecycle workflow: TODO, IN_PROGRESS, and COMPLETED';
    return 'Production Task Management System';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 select-none">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onToggleMobileNav}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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

        {/* User Account Menu with Logout */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            title="User Account"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs">
              {user?.name ? user.name[0].toUpperCase() : <UserIcon className="w-3.5 h-3.5 text-slate-500" />}
            </div>
            <span className="text-xs font-semibold text-slate-700 hidden md:inline max-w-[120px] truncate">
              {user?.name || 'Account'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:inline" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg border border-slate-100 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user?.name || 'TaskFlow User'}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {user?.email}
                </p>
                <div className="mt-1.5">
                  <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {user?.role === 'ADMIN' ? (
                      <>
                        <Shield className="w-3 h-3 mr-1 text-amber-600" />
                        Admin
                      </>
                    ) : (
                      'Team Member'
                    )}
                  </span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
