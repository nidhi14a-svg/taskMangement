'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Filter,
  Upload,
  Download,
  Plus,
  RefreshCw,
  Mail,
  Shield,
  ShieldCheck,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Spinner } from '@/components/common/Spinner';
import { CsvImportModal } from '@/components/employees/CsvImportModal';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { employeeService } from '@/api/services/employeeService';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AccountStatus, Task, User, UserRole } from '@/types';

export default function EmployeesPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: isUserLoading } = useCurrentUser();

  // Guard: ADMIN only
  const isAdmin = currentUser?.role === 'ADMIN';

  // Data state
  const [employees, setEmployees] = useState<User[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Search and Filter states
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modals
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<User | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Load employees from real backend API
  const fetchEmployees = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const params: {
        search?: string;
        role?: UserRole;
        department?: string;
        status?: AccountStatus;
        limit?: number;
      } = {
        limit: 100,
      };

      if (search.trim()) params.search = search.trim();
      if (selectedRole !== 'ALL') params.role = selectedRole as UserRole;
      if (selectedDepartment !== 'ALL') params.department = selectedDepartment;
      if (selectedStatus !== 'ALL') params.status = selectedStatus as AccountStatus;

      const response = await employeeService.getEmployees(params);
      setEmployees(response.items);
      setTotalCount(response.total);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            'Failed to load employee directory';
      setErrorBanner(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, search, selectedRole, selectedDepartment, selectedStatus]);

  useEffect(() => {
    if (!isUserLoading && isAdmin) {
      fetchEmployees();
    }
  }, [isUserLoading, isAdmin, fetchEmployees]);

  // Derive unique departments for filter dropdown
  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department?.trim()) {
        set.add(emp.department.trim());
      }
    });
    return Array.from(set).sort();
  }, [employees]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let active = 0;
    let invited = 0;
    const depts = new Set<string>();

    employees.forEach((emp) => {
      if (emp.status === 'ACTIVE') active++;
      else if (emp.status === 'INVITED') invited++;
      if (emp.department) depts.add(emp.department);
    });

    return {
      total: employees.length,
      active,
      invited,
      departmentsCount: depts.size,
    };
  }, [employees]);

  // Handle template download
  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await employeeService.downloadTemplate();
    } catch {
      setErrorBanner('Failed to download CSV template');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Handle Task Assign button
  const handleOpenAssignTask = (emp: User) => {
    setSelectedAssignee(emp);
    setIsTaskModalOpen(true);
  };

  const handleTaskSuccess = (savedTask: Task) => {
    setIsTaskModalOpen(false);
    setSuccessBanner(
      `Deliverable "${savedTask.title}" successfully assigned to ${selectedAssignee?.name || 'employee'}!`
    );
    setSelectedAssignee(null);
    setTimeout(() => setSuccessBanner(null), 6000);
  };

  // Unauthorized view for non-admin users
  if (!isUserLoading && !isAdmin) {
    return (
      <div className="py-12 px-4 max-w-lg mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          The Employee Management Directory is reserved exclusively for authorized Organization
          Administrators. Your account role ({currentUser?.role || 'EMPLOYEE'}) is not permitted to
          view personnel records or import staff.
        </p>
        <div className="pt-2">
          <Button variant="primary" onClick={() => router.push('/dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Employee Management Directory
            </h2>
            <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              <Shield className="w-3 h-3 mr-1 inline" />
              Admin Access Only
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Oversee organization workforce, inspect account activation statuses, dispatch tasks, and
            safely import personnel via CSV.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            isLoading={isDownloadingTemplate}
            className="flex items-center gap-1.5 font-medium text-slate-700 hover:text-indigo-600 border-slate-200"
            title="Download CSV Template"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">CSV Template</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEmployees()}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
            title="Refresh employee directory"
            aria-label="Refresh employee directory"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-1.5 shadow-sm font-semibold"
            title="Upload CSV to import employees"
            aria-label="Import Employees CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Employees</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {errorBanner && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successBanner && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-500 hover:text-emerald-700 p-1 cursor-pointer"
            aria-label="Dismiss success message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total Staff
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Active Accounts
              </p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">{metrics.active}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Pending Activation
              </p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{metrics.invited}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Active Departments
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics.departmentsCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Directory Filter Toolbar */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff by name or email address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <div>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                aria-label="Filter by role"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Admin</option>
                <option value="TEAM_LEAD">Team Lead</option>
                <option value="EMPLOYEE">Employee</option>
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full text-xs py-2 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                aria-label="Filter by department"
              >
                <option value="ALL">All Departments</option>
                {uniqueDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Account Status:
            </span>
            {[
              { label: 'All Statuses', value: 'ALL' },
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Pending Invitation', value: 'INVITED' },
            ].map((pill) => (
              <button
                key={pill.value}
                onClick={() => setSelectedStatus(pill.value)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                  selectedStatus === pill.value
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pill.label}
              </button>
            ))}

            {(search || selectedRole !== 'ALL' || selectedDepartment !== 'ALL' || selectedStatus !== 'ALL') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedRole('ALL');
                  setSelectedDepartment('ALL');
                  setSelectedStatus('ALL');
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-auto flex items-center gap-1 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Directory Table */}
      <Card className="border-slate-200/80 shadow-xs overflow-hidden">
        <CardHeader className="py-3 px-5 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-sm font-bold text-slate-800">
              Staff Directory ({employees.length})
            </CardTitle>
          </div>
          <span className="text-[11px] text-slate-400">
            Real MongoDB Collection &middot; PyMongo Async
          </span>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Spinner size="lg" className="mx-auto text-indigo-600" />
              <p className="text-xs text-slate-500">Querying employee records from MongoDB...</p>
            </div>
          ) : employees.length === 0 ? (
            <div className="py-16 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No personnel records found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {search || selectedRole !== 'ALL' || selectedDepartment !== 'ALL' || selectedStatus !== 'ALL'
                  ? 'No employees match your active filter criteria. Try clearing filters or searching for another term.'
                  : 'Your organization directory currently has no employees. Import a CSV file to onboard staff safely.'}
              </p>
              <div className="pt-2">
                {search || selectedRole !== 'ALL' || selectedDepartment !== 'ALL' || selectedStatus !== 'ALL' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setSelectedRole('ALL');
                      setSelectedDepartment('ALL');
                      setSelectedStatus('ALL');
                    }}
                  >
                    Clear Filters
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsCsvModalOpen(true)}
                    className="flex items-center gap-1.5 mx-auto"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Staff via CSV</span>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="py-3 px-5">Employee</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department & Position</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Registered / Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((emp) => {
                    const empId = emp.id || emp._id || '';
                    const isCurrentUser = currentUser?.id === empId || currentUser?._id === empId;

                    return (
                      <tr key={empId} className="hover:bg-slate-50/70 transition-colors">
                        {/* Name & Email */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {emp.name ? emp.name[0].toUpperCase() : 'U'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 text-xs">
                                  {emp.name}
                                </span>
                                {isCurrentUser && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                                    You
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span>{emp.email}</span>
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {emp.role === 'ADMIN' ? (
                            <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </span>
                          ) : emp.role === 'TEAM_LEAD' ? (
                            <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Team Lead
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              Employee
                            </span>
                          )}
                        </td>

                        {/* Department & Position */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-800 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-slate-400" />
                              <span>{emp.position || 'Standard Staff'}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{emp.department || 'General'}</span>
                            </p>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {emp.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Active
                            </span>
                          ) : emp.status === 'INVITED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Pending Activation
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              Deactivated
                            </span>
                          )}
                        </td>

                        {/* Joined Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                          {emp.created_at ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {new Date(emp.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Established</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAssignTask(emp)}
                            className="font-medium text-xs flex items-center gap-1 ml-auto hover:border-indigo-300 hover:text-indigo-600"
                            title={`Assign a new task to ${emp.name}`}
                          >
                            <Plus className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Assign Task</span>
                          </Button>
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

      {/* CSV Import Modal Wizard */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportSuccess={() => {
          fetchEmployees();
          setSuccessBanner('Employees imported successfully! Direct task assignments now available.');
          setTimeout(() => setSuccessBanner(null), 6000);
        }}
      />

      {/* Direct Task Assignment Modal */}
      <TaskFormModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedAssignee(null);
        }}
        defaultAssigneeId={selectedAssignee?.id || selectedAssignee?._id || null}
        onSuccess={handleTaskSuccess}
      />
    </div>
  );
}
