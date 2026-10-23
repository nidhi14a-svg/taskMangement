'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { dashboardService } from '@/api/services/dashboardService';
import { DashboardSummary } from '@/types';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSummary = async () => {
    setIsLoading(true);
    try {
      const data = await dashboardService.getSummary();
      setSummary(data);
    } catch {
      // Fallback empty metrics shell if unauthenticated at page-shell stage
      setSummary({
        total_tasks: 0,
        pending_tasks: 0,
        completed_tasks: 0,
        overdue_tasks: 0,
        status_breakdown: { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 },
        priority_breakdown: { LOW: 0, MEDIUM: 0, HIGH: 0 },
        completion_rate: 0.0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const handleTaskCreated = () => fetchSummary();
    window.addEventListener('task-created', handleTaskCreated);
    return () => window.removeEventListener('task-created', handleTaskCreated);
  }, []);

  const stats = [
    {
      title: 'Total Tasks',
      value: summary?.total_tasks ?? 0,
      icon: CheckSquare,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 border-indigo-100',
      desc: 'All scoped tasks',
    },
    {
      title: 'Pending Tasks',
      value: summary?.pending_tasks ?? 0,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 border-blue-100',
      desc: 'To Do & In Progress',
    },
    {
      title: 'Completed Tasks',
      value: summary?.completed_tasks ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 border-emerald-100',
      desc: 'Finished deliverables',
    },
    {
      title: 'Overdue Tasks',
      value: summary?.overdue_tasks ?? 0,
      icon: AlertCircle,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50 border-rose-100',
      desc: 'Past due deadline',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Workspace Overview
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time execution metrics and task distribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSummary}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Link href="/board">
            <Button variant="primary" size="sm" className="flex items-center gap-1.5">
              Open Board
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{stat.title}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${stat.bgColor} ${stat.color}`}
              >
                <stat.icon className="w-5 h-5 stroke-[2]" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
              {stat.desc}
            </p>
          </Card>
        ))}
      </div>

      {/* Completion Rate Progress Banner */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Completion Velocity</h4>
              <p className="text-xs text-slate-500">Overall finished deliverables ratio</p>
            </div>
          </div>
          <span className="text-xl font-bold text-slate-900">
            {summary?.completion_rate ?? 0}%
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, summary?.completion_rate ?? 0))}%` }}
          />
        </div>
      </Card>

      {/* Distribution Breakdowns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
            <Badge variant="outline" size="sm">Lifecycle</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span className="text-xs font-medium text-slate-700">To Do</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {summary?.status_breakdown?.TODO ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs font-medium text-slate-700">In Progress</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {summary?.status_breakdown?.IN_PROGRESS ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-700">Completed</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {summary?.status_breakdown?.COMPLETED ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Priority Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Priority Allocation</CardTitle>
            <Badge variant="outline" size="sm">Severity</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <span className="text-xs font-medium text-slate-700">Low Priority</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {summary?.priority_breakdown?.LOW ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs font-medium text-slate-700">Medium Priority</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {summary?.priority_breakdown?.MEDIUM ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-xs font-medium text-slate-700">High Priority</span>
              </div>
              <span className="text-sm font-bold text-slate-900">
                {summary?.priority_breakdown?.HIGH ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
