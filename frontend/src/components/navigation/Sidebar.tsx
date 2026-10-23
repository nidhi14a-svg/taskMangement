'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  UserCheck,
  Kanban,
  Plus,
  FileCode,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';

export interface SidebarProps {
  onCreateTask?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCreateTask, className }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFilter = searchParams ? searchParams.get('filter') : null;

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      isActive: pathname === '/dashboard',
    },
    {
      name: 'My Tasks',
      href: '/tasks',
      icon: CheckSquare,
      isActive: pathname === '/tasks' && !currentFilter,
    },
    {
      name: 'Assigned to Me',
      href: '/tasks?filter=assigned',
      icon: UserCheck,
      isActive: pathname === '/tasks' && currentFilter === 'assigned',
    },
    {
      name: 'Kanban Board',
      href: '/board',
      icon: Kanban,
      isActive: pathname === '/board',
    },
  ];

  return (
    <aside
      className={cn(
        'w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between shrink-0 h-screen sticky top-0 z-30 select-none',
        className
      )}
    >
      {/* Top Header & Brand */}
      <div>
        <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-600/20 group-hover:bg-indigo-700 transition-colors">
              <CheckSquare className="w-4 h-4 stroke-[2.25]" />
            </div>
            <div>
              <span className="text-base font-bold text-slate-900 tracking-tight block leading-tight">
                TaskFlow
              </span>
              <span className="text-[10px] font-medium text-slate-400 block tracking-wider uppercase">
                Enterprise
              </span>
            </div>
          </Link>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            v1.0
          </span>
        </div>

        {/* Quick Action Button */}
        <div className="p-4">
          <Button
            variant="primary"
            size="md"
            className="w-full flex items-center justify-center gap-2 shadow-sm font-semibold text-xs py-2.5"
            onClick={onCreateTask}
          >
            <Plus className="w-4 h-4" />
            Create Task
          </Button>
        </div>

        {/* Main Navigation */}
        <div className="px-3 py-2 space-y-6">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Workspace
            </p>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
                    item.isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  <item.icon
                    className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      item.isActive ? 'text-indigo-600' : 'text-slate-400'
                    )}
                  />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Developer APIs
            </p>
            <div className="space-y-1">
              <a
                href="http://127.0.0.1:8000/api/v1/docs"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <FileCode className="w-4 h-4 shrink-0 text-slate-400" />
                Swagger Docs (FastAPI)
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* User Footer Card */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center font-semibold text-xs shrink-0">
              AD
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-800 truncate">Alex Developer</p>
              <p className="text-[11px] text-slate-400 truncate">alex@taskflow.com</p>
            </div>
          </div>
          <Link
            href="/login"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
};
