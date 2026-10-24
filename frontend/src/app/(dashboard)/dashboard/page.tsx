'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  Calendar,
  Inbox,
  Kanban,
  ListTodo,
  Users,
  Shield,
  ShieldCheck,
  Upload,
  Search,
  FileSpreadsheet,
  X,
  UserCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Spinner } from '@/components/common/Spinner';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { CsvImportModal } from '@/components/employees/CsvImportModal';
import { dashboardService } from '@/api/services/dashboardService';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { DashboardSummary, Task, TaskStatus, User } from '@/types';
import { extractErrorMessage } from '@/utils/formatters';

// Theme-tailored colors for Status Donut Chart
const STATUS_COLORS = {
  TODO: '#94a3b8', // Slate 400
  IN_PROGRESS: '#3b82f6', // Blue 500
  COMPLETED: '#10b981', // Emerald 500
};

// Theme-tailored colors for Priority Bar Chart
const PRIORITY_COLORS = {
  LOW: '#0284c7', // Sky 600
  MEDIUM: '#f59e0b', // Amber 500
  HIGH: '#ef4444', // Rose 500
};

export default function DashboardPage() {
  const { user: currentUser } = useCurrentUser();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Role detection
  const isAdmin = currentUser?.role === 'ADMIN';
  const isTeamLead = currentUser?.role === 'TEAM_LEAD';

  // Client mounting state for Recharts container calculation
  const [isMounted, setIsMounted] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Admin search filter for employee directory
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Status updating indicator
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch users directory (backend automatically scopes: ADMIN sees all, TEAM_LEAD/EMPLOYEE sees department)
  const fetchUsers = useCallback(async () => {
    try {
      const data = await userService.getUsers();
      setUsers(data);
    } catch {
      // Non-fatal if directory fails
    }
  }, []);

  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      if (u.id) map.set(String(u.id), u);
      if (u._id) map.set(String(u._id), u);
    }
    return map;
  }, [users]);

  // Fetch dashboard summary and recent tasks from APIs
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const [summaryData, tasksData] = await Promise.all([
        dashboardService.getSummary(),
        taskService.getTasks({
          sort_by: 'created_at',
          sort_order: 'desc',
          page_size: 10,
        }),
      ]);

      setSummary(summaryData);
      setRecentTasks(tasksData.items);
    } catch (err: any) {
      setErrorBanner(
        extractErrorMessage(err?.response?.data?.detail, 'Failed to load dashboard metrics. Verify backend connection.')
      );
      setSummary({
        total_tasks: 0,
        pending_tasks: 0,
        completed_tasks: 0,
        overdue_tasks: 0,
        status_breakdown: { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 },
        priority_breakdown: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 },
        completion_rate: 0.0,
      });
      setRecentTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchDashboardData();

    const handleDataChange = () => {
      fetchDashboardData();
      fetchUsers();
    };

    window.addEventListener('task-created', handleDataChange);
    window.addEventListener('task-updated', handleDataChange);
    window.addEventListener('task-deleted', handleDataChange);

    return () => {
      window.removeEventListener('task-created', handleDataChange);
      window.removeEventListener('task-updated', handleDataChange);
      window.removeEventListener('task-deleted', handleDataChange);
    };
  }, [fetchUsers, fetchDashboardData, currentUser]);

  // Direct status update handler for employees / leads
  const handleQuickStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setUpdatingTaskId(taskId);
    try {
      await taskService.updateTask(taskId, { status: newStatus });
      setRecentTasks((prev) =>
        prev.map((t) => (t.id === taskId || t._id === taskId ? { ...t, status: newStatus } : t))
      );
      window.dispatchEvent(new CustomEvent('task-updated'));
    } catch (err: any) {
      setErrorBanner(extractErrorMessage(err?.response?.data?.detail, 'Failed to update deliverable status.'));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Primary KPI Statistics Definitions
  const totalCount = summary?.total_tasks ?? 0;
  const pendingCount = summary?.pending_tasks ?? 0;
  const completedCount = summary?.completed_tasks ?? 0;
  const overdueCount = summary?.overdue_tasks ?? 0;
  const totalEmployeesCount = summary?.total_employees ?? users.length;
  const totalTeamMembersCount = summary?.total_team_members ?? users.length;

  const stats = [
    ...(isAdmin
      ? [
          {
            title: 'Total Employees',
            value: totalEmployeesCount,
            icon: Users,
            color: 'text-purple-600',
            bgColor: 'bg-purple-50 border-purple-100',
            desc: 'Organization-wide staff',
          },
        ]
      : isTeamLead
      ? [
          {
            title: 'Authorized Team Members',
            value: totalTeamMembersCount,
            icon: Users,
            color: 'text-indigo-600',
            bgColor: 'bg-indigo-50 border-indigo-100',
            desc: `${currentUser?.department || 'Department'} division`,
          },
        ]
      : []),
    {
      title: 'Total Tasks',
      value: totalCount,
      icon: CheckSquare,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 border-indigo-100',
      desc: isAdmin ? 'Organization deliverables' : isTeamLead ? 'Team deliverables' : 'My deliverables',
    },
    {
      title: 'Pending Tasks',
      value: pendingCount,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 border-blue-100',
      desc: 'To Do & In Progress',
    },
    {
      title: 'Completed Tasks',
      value: completedCount,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 border-emerald-100',
      desc: 'Delivered work',
    },
    {
      title: 'Overdue Tasks',
      value: overdueCount,
      icon: AlertCircle,
      color: overdueCount > 0 ? 'text-rose-600' : 'text-slate-500',
      bgColor: overdueCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200',
      desc: overdueCount > 0 ? 'Immediate action required' : 'No past-due deliverables',
      isWarning: overdueCount > 0,
    },
  ];

  // Prepare Recharts Data
  const statusChartData = useMemo(() => {
    if (!summary) return [];
    const b = summary.status_breakdown;
    return [
      { name: 'To Do', value: b.TODO || 0, key: 'TODO', color: STATUS_COLORS.TODO },
      {
        name: 'In Progress',
        value: b.IN_PROGRESS || 0,
        key: 'IN_PROGRESS',
        color: STATUS_COLORS.IN_PROGRESS,
      },
      {
        name: 'Completed',
        value: b.COMPLETED || 0,
        key: 'COMPLETED',
        color: STATUS_COLORS.COMPLETED,
      },
    ];
  }, [summary]);

  const priorityChartData = useMemo(() => {
    if (!summary) return [];
    const b = summary.priority_breakdown;
    return [
      { name: 'Low Priority', count: b.LOW || 0, fill: PRIORITY_COLORS.LOW },
      { name: 'Medium Priority', count: b.MEDIUM || 0, fill: PRIORITY_COLORS.MEDIUM },
      { name: 'High Priority', count: b.HIGH || 0, fill: PRIORITY_COLORS.HIGH },
    ];
  }, [summary]);

  const hasData = totalCount > 0;

  // Filtered employees list for Admin
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return users;
    const q = employeeSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        (u.position && u.position.toLowerCase().includes(q))
    );
  }, [users, employeeSearch]);

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {isAdmin
                ? 'Organization Administration & Analytics'
                : isTeamLead
                ? `Team Lead Workspace • ${currentUser?.department || 'Department'}`
                : 'My Workspace & Deliverables'}
            </h2>
            {isAdmin ? (
              <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                <Shield className="w-3 h-3 mr-1 inline" />
                Admin
              </span>
            ) : isTeamLead ? (
              <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                <ShieldCheck className="w-3 h-3 mr-1 inline" />
                Team Lead
              </span>
            ) : null}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Organization-wide staff oversight, deliverable analytics, and CSV employee onboarding entry point'
              : isTeamLead
              ? `Authorized team members in ${currentUser?.department || 'your department'}, team deliverables, and assignment tracking`
              : 'Assigned deliverables, upcoming deadlines, priorities, and direct status updates'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchUsers();
              fetchDashboardData();
            }}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
            title="Refresh dashboard metrics"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Admin CSV Employee Import Entry Point */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCsvModalOpen(true)}
              className="flex items-center gap-1.5 font-medium text-slate-700 hover:text-indigo-600 border-slate-200"
              title="Employee CSV Import"
              aria-label="Open CSV Employee Import"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Import CSV</span>
            </Button>
          )}

          <Link href="/board">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 font-medium"
              title="Open Kanban Board"
              aria-label="Open Kanban Board"
            >
              <Kanban className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Kanban</span>
            </Button>
          </Link>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 shadow-sm font-semibold"
            aria-label="Create new task deliverable"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Task</span>
          </Button>
        </div>
      </div>

      {errorBanner && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between font-medium leading-relaxed"
        >
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
            aria-label="Dismiss error banner"
          >
            &times;
          </button>
        </div>
      )}

      {/* Primary KPI Metrics Grid */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          stats.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        } gap-4`}
      >
        {stats.map((stat) => (
          <Card key={stat.title} className="p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {stat.title}
                </p>
                <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1 tracking-tight">
                  {stat.value}
                </p>
              </div>
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-2xs ${stat.bgColor} ${stat.color}`}
              >
                <stat.icon className="w-5 h-5 stroke-[2.25]" />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
              <span className="truncate">{stat.desc}</span>
              {stat.isWarning && (
                <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                  Alert
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Deliverable Completion Progress Banner */}
      <Card className="p-5 border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Deliverable Completion Velocity</h4>
              <p className="text-xs text-slate-500">
                {completedCount} of {totalCount} total scoped deliverables completed
              </p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900">
              {summary?.completion_rate ?? 0}%
            </span>
            <span className="text-xs text-slate-500 font-medium">rate</span>
          </div>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, summary?.completion_rate ?? 0))}%` }}
          />
        </div>
      </Card>

      {/* TEAM LEAD: Authorized Team Members Roster */}
      {isTeamLead && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle>Authorized Team Members</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Staff authorized for deliverable assignments within the{' '}
                <span className="font-semibold text-indigo-700">
                  {currentUser?.department || 'Department'}
                </span>{' '}
                division
              </p>
            </div>
            <Badge variant="outline" size="sm">
              {users.length} members
            </Badge>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No team members found in your department.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {users.map((member) => (
                  <div
                    key={member.id || member._id}
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center gap-3 hover:bg-white hover:shadow-xs transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center font-bold text-xs shrink-0">
                      {member.name ? member.name[0].toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{member.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{member.email}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {member.position || 'Team Member'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {member.role === 'TEAM_LEAD' ? 'Lead' : 'Employee'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ADMIN: Employee Management Directory */}
      {isAdmin && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Organization Employee Management</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Directory of all organization staff, department affiliations, and authorization roles
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter staff by name or dept..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 sm:w-64"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCsvModalOpen(true)}
                className="text-xs flex items-center gap-1 font-semibold"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>CSV Import</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Employee</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Position</th>
                    <th className="py-3 px-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        No employees found matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <tr key={emp.id || emp._id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {emp.name ? emp.name[0].toUpperCase() : 'U'}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 leading-tight">{emp.name}</p>
                              <p className="text-[11px] text-slate-400">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {emp.role === 'ADMIN' ? (
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              <Shield className="w-2.5 h-2.5 mr-1" />
                              ADMIN
                            </span>
                          ) : emp.role === 'TEAM_LEAD' ? (
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                              <ShieldCheck className="w-2.5 h-2.5 mr-1" />
                              TEAM LEAD
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              EMPLOYEE
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700 font-medium text-[11px]">
                          {emp.department || <span className="text-slate-400 italic">General</span>}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 text-[11px]">
                          {emp.position || <span className="text-slate-400 italic">Staff Member</span>}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                          {emp.created_at
                            ? new Date(emp.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Active'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visual Analytics Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Status Distribution Donut Chart */}
        <Card className="flex flex-col">
          <CardHeader>
            <div>
              <CardTitle>Task Status Distribution</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Proportion of deliverables across lifecycle states
              </p>
            </div>
            <Badge variant="outline" size="sm">
              Workflow
            </Badge>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-center min-h-[300px]">
            {!hasData ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <Inbox className="w-8 h-8 text-slate-300" />
                <p className="font-semibold text-slate-600">No status data available</p>
                <p>Create tasks to visualize lifecycle distribution.</p>
              </div>
            ) : isMounted ? (
              <>
                <div
                  className="w-full h-64 min-h-[250px]"
                  role="region"
                  aria-label="Donut chart showing task status breakdown"
                >
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={240}>
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                      >
                        {statusChartData.map((entry) => (
                          <Cell key={`cell-${entry.key}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: any, name: any) => {
                          const count = Number(val) || 0;
                          const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                          return [`${count} tasks (${pct}%)`, name];
                        }}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => (
                          <span className="text-xs text-slate-700 font-medium">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Accessible Hidden Summary for Screen Readers */}
                <div className="sr-only">
                  <table>
                    <caption>Task Status Breakdown</caption>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusChartData.map((item) => (
                        <tr key={item.key}>
                          <td>{item.name}</td>
                          <td>{item.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center">
                <Spinner size="md" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority Allocation Bar Chart */}
        <Card className="flex flex-col">
          <CardHeader>
            <div>
              <CardTitle>Priority Allocation</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Urgency breakdown across active workload
              </p>
            </div>
            <Badge variant="outline" size="sm">
              Severity
            </Badge>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-center min-h-[300px]">
            {!hasData ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <Inbox className="w-8 h-8 text-slate-300" />
                <p className="font-semibold text-slate-600">No priority data available</p>
                <p>Task priorities will be plotted here upon creation.</p>
              </div>
            ) : isMounted ? (
              <>
                <div
                  className="w-full h-64 min-h-[250px]"
                  role="region"
                  aria-label="Bar chart showing task distribution by priority level"
                >
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={240}>
                    <BarChart
                      data={priorityChartData}
                      margin={{ top: 12, right: 12, left: -20, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        formatter={(val: any) => [`${val} tasks`, 'Count']}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {priorityChartData.map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Accessible Hidden Summary for Screen Readers */}
                <div className="sr-only">
                  <table>
                    <caption>Task Priority Breakdown</caption>
                    <thead>
                      <tr>
                        <th>Priority</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priorityChartData.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center">
                <Spinner size="md" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Deliverables Section with Direct Status Updates for Employees */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle>
              {isAdmin
                ? 'Recent Organization Deliverables'
                : isTeamLead
                ? 'Department Deliverables & Tracking'
                : 'My Tasks & Assigned Deliverables'}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAdmin
                ? 'Latest tasks created or prioritized across your organization'
                : isTeamLead
                ? 'Track deliverables assigned to members within your department'
                : 'View assigned tasks and update status directly from your dashboard'}
            </p>
          </div>
          <Link
            href="/tasks"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <span>View all tasks</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Spinner size="md" />
              <p className="text-xs text-slate-500">Loading recent tasks...</p>
            </div>
          ) : recentTasks.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center gap-3">
              <ListTodo className="w-8 h-8 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-800">No deliverables yet</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  No tasks found in your current workspace scope.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-2 text-xs font-semibold"
              >
                Create your first task
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Deliverable Title</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Assignee</th>
                    <th className="py-3 px-4 text-right">Quick Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {recentTasks.map((task) => {
                    const id = String(task.id || task._id || '');
                    const isOverdue =
                      task.due_date &&
                      new Date(task.due_date) < new Date() &&
                      task.status !== 'COMPLETED';

                    const assigneeUser = task.assignee_id
                      ? usersMap.get(String(task.assignee_id))
                      : null;

                    const isUpdating = updatingTaskId === id;

                    return (
                      <tr key={id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-5 max-w-xs sm:max-w-md">
                          <Link
                            href="/tasks"
                            className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors block truncate"
                          >
                            {task.title}
                          </Link>
                          {task.description && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {task.description}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge status={task.status} dot size="sm" />
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge priority={task.priority} size="sm" />
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 text-[11px]">
                          {task.due_date ? (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                isOverdue ? 'text-red-600 font-bold' : ''
                              }`}
                            >
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {new Date(task.due_date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                              {isOverdue && ' (Overdue)'}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No deadline</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                          {assigneeUser ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-[9px] shrink-0">
                                {assigneeUser.name[0].toUpperCase()}
                              </div>
                              <span className="text-slate-700 font-medium truncate max-w-[120px]">
                                {assigneeUser.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right text-[11px]">
                          <select
                            value={task.status}
                            onChange={(e) =>
                              handleQuickStatusChange(id, e.target.value as TaskStatus)
                            }
                            disabled={isUpdating}
                            className="text-xs py-1 px-2 rounded-md border border-slate-200 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                            aria-label={`Update status for ${task.title}`}
                          >
                            <option value="TODO">To Do</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Quick Create Task Modal */}
      <TaskFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchDashboardData()}
      />

      {/* ADMIN: Employee CSV Import Wizard */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportSuccess={() => {
          fetchUsers();
          fetchDashboardData();
        }}
      />
    </div>
  );
}
