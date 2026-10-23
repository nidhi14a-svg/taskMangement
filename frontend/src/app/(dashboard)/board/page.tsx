'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Spinner } from '@/components/common/Spinner';
import { taskService } from '@/api/services/taskService';
import { Task, TaskStatus } from '@/types';

interface ColumnDef {
  id: TaskStatus;
  title: string;
  badgeVariant: 'default' | 'primary' | 'success';
}

const COLUMNS: ColumnDef[] = [
  { id: 'TODO', title: 'To Do', badgeVariant: 'default' },
  { id: 'IN_PROGRESS', title: 'In Progress', badgeVariant: 'primary' },
  { id: 'COMPLETED', title: 'Completed', badgeVariant: 'success' },
];

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await taskService.getTasks({ page_size: 100 });
      setTasks(data.items);
    } catch {
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const handleCreated = () => fetchTasks();
    window.addEventListener('task-created', handleCreated);
    return () => window.removeEventListener('task-created', handleCreated);
  }, [fetchTasks]);

  const moveTask = async (taskId: string, targetStatus: TaskStatus) => {
    try {
      await taskService.updateTask(taskId, { status: targetStatus });
      fetchTasks();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to update task status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Kanban Board
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Interactive visual workflow tracking deliverables from backlog to completion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTasks}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">Loading Kanban boards...</p>
        </div>
      ) : (
        /* Kanban Columns Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);

            return (
              <div
                key={col.id}
                className="bg-slate-100/70 rounded-xl p-4 border border-slate-200/80 flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">{col.title}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200 shadow-2xs">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Task Cards in Column */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {colTasks.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs">
                      No tasks in {col.title.toLowerCase()}
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const id = task.id || task._id || '';
                      const isOverdue =
                        task.due_date &&
                        new Date(task.due_date) < new Date() &&
                        task.status !== 'COMPLETED';

                      return (
                        <div
                          key={id}
                          className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs hover:shadow-sm transition-shadow duration-150 space-y-3 text-left"
                        >
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                              {task.title}
                            </h4>
                            {task.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                                {task.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <Badge priority={task.priority} size="sm" />
                            {task.due_date && (
                              <span
                                className={`text-[11px] flex items-center gap-1 ${
                                  isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {new Date(task.due_date).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                          </div>

                          {/* Quick Advance Workflow Action */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                            <span className="text-[10px] uppercase font-semibold tracking-wider">
                              Move
                            </span>
                            <div className="flex items-center gap-1">
                              {col.id !== 'TODO' && (
                                <button
                                  onClick={() => moveTask(id, 'TODO')}
                                  className="px-2 py-0.5 rounded text-[11px] hover:bg-slate-100 text-slate-600 transition-colors"
                                  title="Move to To Do"
                                >
                                  To Do
                                </button>
                              )}
                              {col.id !== 'IN_PROGRESS' && (
                                <button
                                  onClick={() => moveTask(id, 'IN_PROGRESS')}
                                  className="px-2 py-0.5 rounded text-[11px] hover:bg-blue-50 text-blue-600 transition-colors font-medium"
                                  title="Move to In Progress"
                                >
                                  In Progress
                                </button>
                              )}
                              {col.id !== 'COMPLETED' && (
                                <button
                                  onClick={() => moveTask(id, 'COMPLETED')}
                                  className="px-2 py-0.5 rounded text-[11px] hover:bg-emerald-50 text-emerald-600 transition-colors font-medium"
                                  title="Move to Completed"
                                >
                                  Complete &check;
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
