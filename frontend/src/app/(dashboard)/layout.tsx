'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { Header } from '@/components/navigation/Header';
import { MobileNav } from '@/components/navigation/MobileNav';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Persistent Sidebar */}
      <React.Suspense fallback={<div className="w-64 bg-white border-r border-slate-200/90 hidden md:block" />}>
        <Sidebar
          className="hidden md:flex"
          onCreateTask={() => setIsCreateModalOpen(true)}
        />
      </React.Suspense>

      {/* Mobile Drawer Navigation */}
      <MobileNav
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        onCreateTask={() => setIsCreateModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleMobileNav={() => setIsMobileNavOpen(true)}
          onCreateTask={() => setIsCreateModalOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTaskCreated={() => {
          // Trigger page refresh if necessary
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('task-created'));
          }
        }}
      />
    </div>
  );
}
