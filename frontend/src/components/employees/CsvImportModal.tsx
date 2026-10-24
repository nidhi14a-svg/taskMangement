'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  Download,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Users,
  Shield,
  ShieldCheck,
  Check,
  Trash2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Spinner } from '@/components/common/Spinner';
import { employeeService } from '@/api/services/employeeService';
import { extractErrorMessage } from '@/utils/formatters';
import {
  EmployeeImportPreviewResponse,
  EmployeeImportPreviewRow,
  EmployeeImportConfirmResponse,
} from '@/types';

export interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
  onImportSuccess?: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onImportSuccess,
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'report'>('upload');

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Preview & Mapping state
  const [previewData, setPreviewData] = useState<EmployeeImportPreviewResponse | null>(null);
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});
  const [activeRows, setActiveRows] = useState<EmployeeImportPreviewRow[]>([]);
  const [excludedRowNums, setExcludedRowNums] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
  const [previewSearch, setPreviewSearch] = useState('');

  // Confirmation & Report state
  const [confirmResult, setConfirmResult] = useState<EmployeeImportConfirmResponse | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetAll = () => {
    setStep('upload');
    setSelectedFile(null);
    setUploadError(null);
    setPreviewData(null);
    setCustomMapping({});
    setActiveRows([]);
    setExcludedRowNums(new Set());
    setFilterMode('ALL');
    setPreviewSearch('');
    setConfirmResult(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // Step 1: File selection & upload
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setUploadError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Only valid .csv files are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size exceeds the 5 MB limit.');
      return;
    }
    setSelectedFile(file);
  };

  const handleRunPreview = async (overrideMapping?: Record<string, string>) => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setUploadError(null);

    try {
      const data = await employeeService.previewImport(selectedFile, overrideMapping || customMapping);
      setPreviewData(data);
      setActiveRows(data.rows);
      setExcludedRowNums(new Set());

      if (data.mapping_required) {
        setStep('mapping');
        setCustomMapping(data.column_mapping || {});
      } else {
        setStep('preview');
      }
    } catch (err: any) {
      setUploadError(
        extractErrorMessage(err?.response?.data?.detail, 'Failed to parse CSV file. Ensure valid formatting.')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Custom column mapping confirmation
  const handleApplyMapping = () => {
    handleRunPreview(customMapping);
  };

  // Step 3: Row exclusion toggle
  const toggleRowExclusion = (rowNum: number) => {
    setExcludedRowNums((prev) => {
      const updated = new Set(prev);
      if (updated.has(rowNum)) {
        updated.delete(rowNum);
      } else {
        updated.add(rowNum);
      }
      return updated;
    });
  };

  // Filter preview rows
  const filteredRows = activeRows.filter((r) => {
    if (filterMode === 'VALID' && (!r.is_valid || excludedRowNums.has(r.row_number))) return false;
    if (filterMode === 'INVALID' && r.is_valid) return false;
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.department && r.department.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const validApprovedRows = activeRows.filter(
    (r) => r.is_valid && !excludedRowNums.has(r.row_number)
  );

  // Step 4: Confirm import execution
  const handleConfirmImport = async () => {
    if (validApprovedRows.length === 0) return;
    setIsConfirming(true);

    try {
      const result = await employeeService.confirmImport(validApprovedRows, true);
      setConfirmResult(result);
      setStep('report');
      if (onImportComplete) {
        onImportComplete();
      }
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err: any) {
      setUploadError(
        extractErrorMessage(err?.response?.data?.detail, 'Import failed. Check network or server connection.')
      );
    } finally {
      setIsConfirming(false);
    }
  };

  // Download error report for rejected rows
  const handleDownloadErrors = async () => {
    const invalidRows = activeRows.filter((r) => !r.is_valid);
    if (invalidRows.length === 0) return;
    await employeeService.downloadErrorReport(invalidRows);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <FileSpreadsheet className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {step === 'upload' && 'Bulk Import Employees via CSV'}
                {step === 'mapping' && 'Map CSV Column Headers'}
                {step === 'preview' && 'Review & Validate Employee Data'}
                {step === 'report' && 'Employee Import Summary'}
              </h3>
              <p className="text-xs text-slate-500">
                {step === 'upload' && 'Upload a standardized CSV file to provision accounts safely'}
                {step === 'mapping' && 'Match your CSV columns to TaskFlow employee attributes'}
                {step === 'preview' && 'Audit cleaned rows, check duplicates, and approve valid records'}
                {step === 'report' && 'Final onboarding results and invitation dispatch report'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Global Alert */}
          {uploadError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5 font-medium leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="flex-1">{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">
                &times;
              </button>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-400/20'
                    : 'border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <Upload className="w-6 h-6 stroke-[2]" />
                </div>

                <p className="text-sm font-bold text-slate-900">
                  {selectedFile ? selectedFile.name : 'Click to upload or drag and drop your CSV file'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supported format: <span className="font-semibold text-slate-700">.csv</span> (UTF-8, max 5 MB, up to 1,000 rows)
                </p>

                {selectedFile && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{(selectedFile.size / 1024).toFixed(1)} KB selected</span>
                  </div>
                )}
              </div>

              {/* Sample Template & Specifications */}
              <div className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-900">Need a sample format?</p>
                  <p className="text-[11px] text-slate-500">
                    Download our verified template with columns: name, email, role, department, position.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => employeeService.downloadTemplate()}
                  className="shrink-0 text-xs flex items-center gap-1.5 font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample CSV</span>
                </Button>
              </div>

              {/* Validation Rules Card */}
              <div className="rounded-xl border border-slate-200/80 p-4 bg-white text-xs space-y-2">
                <p className="font-bold text-slate-800">Deterministic validation features:</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 list-disc list-inside">
                  <li>Automatic UTF-8 and UTF-8 BOM decoding</li>
                  <li>Synonym alias recognition for all headers</li>
                  <li>Whitespace trimming & email lowercasing</li>
                  <li>Duplicate email detection in file and MongoDB</li>
                  <li>Preserves original row numbers for error tracking</li>
                  <li>Activation token generation for invited staff</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Some required columns could not be mapped with high confidence. Please specify which CSV columns match the required attributes.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {(['name', 'email', 'role', 'department', 'position'] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {field} {field === 'name' || field === 'email' ? <span className="text-red-500">*</span> : ''}
                    </label>
                    <select
                      value={customMapping[field] || ''}
                      onChange={(e) =>
                        setCustomMapping((prev) => ({ ...prev, [field]: e.target.value }))
                      }
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Select matching CSV column --</option>
                      {previewData?.headers_detected.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 'preview' && previewData && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Rows</p>
                  <p className="text-xl font-extrabold text-slate-900 mt-0.5">{previewData.total_rows}</p>
                </div>
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60">
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase">Valid to Import</p>
                  <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{validApprovedRows.length}</p>
                </div>
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/60">
                  <p className="text-[10px] font-semibold text-rose-700 uppercase">Validation Errors</p>
                  <p className="text-xl font-extrabold text-rose-700 mt-0.5">{previewData.invalid_rows_count}</p>
                </div>
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60">
                  <p className="text-[10px] font-semibold text-amber-700 uppercase">Duplicates / DB</p>
                  <p className="text-xl font-extrabold text-amber-700 mt-0.5">
                    {previewData.duplicate_rows_count + previewData.existing_rows_count}
                  </p>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setFilterMode('ALL')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      filterMode === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    All ({activeRows.length})
                  </button>
                  <button
                    onClick={() => setFilterMode('VALID')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      filterMode === 'VALID' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Valid ({previewData.valid_rows_count})
                  </button>
                  <button
                    onClick={() => setFilterMode('INVALID')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      filterMode === 'INVALID' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Errors ({previewData.invalid_rows_count})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search preview..."
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
                    />
                  </div>

                  {previewData.invalid_rows_count > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadErrors}
                      className="text-xs flex items-center gap-1 text-slate-600"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Error CSV</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">Approve</th>
                      <th className="py-2.5 px-3 w-12 text-center">Row</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Email</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Dept</th>
                      <th className="py-2.5 px-4">Status & Messages</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const isExcluded = excludedRowNums.has(row.row_number);
                      const isRowApproved = row.is_valid && !isExcluded;

                      return (
                        <tr
                          key={row.row_number}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            !row.is_valid ? 'bg-rose-50/20' : isExcluded ? 'opacity-50' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center">
                            {row.is_valid ? (
                              <input
                                type="checkbox"
                                checked={isRowApproved}
                                onChange={() => toggleRowExclusion(row.row_number)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                title={isExcluded ? 'Include row' : 'Exclude row'}
                              />
                            ) : (
                              <span className="text-slate-300 font-bold">&times;</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400">
                            {row.row_number}
                          </td>
                          <td className="py-2 px-4 font-semibold text-slate-800 whitespace-nowrap">
                            {row.name || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="py-2 px-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                            {row.email}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {row.role}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                            {row.department || <span className="text-slate-300 italic">None</span>}
                          </td>
                          <td className="py-2 px-4">
                            {row.is_valid ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  Valid
                                </span>
                                {row.warnings.map((w, idx) => (
                                  <span key={idx} className="text-[10px] text-amber-600 font-medium">
                                    {w}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                {row.errors.map((err, idx) => (
                                  <p key={idx} className="text-[10px] text-rose-600 font-semibold leading-tight">
                                    • {err}
                                  </p>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: FINAL REPORT */}
          {step === 'report' && confirmResult && (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <Check className="w-7 h-7 stroke-[2.5]" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-slate-900">Import Completed Successfully</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Employee records were processed and saved to TaskFlow MongoDB
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                  <p className="text-2xl font-black text-emerald-700">{confirmResult.imported_count}</p>
                  <p className="text-[10px] font-bold text-emerald-800 uppercase mt-0.5">Imported</p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-2xl font-black text-slate-700">{confirmResult.skipped_count}</p>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mt-0.5">Skipped</p>
                </div>
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50">
                  <p className="text-2xl font-black text-rose-700">{confirmResult.failed_count}</p>
                  <p className="text-[10px] font-bold text-rose-800 uppercase mt-0.5">Failed</p>
                </div>
              </div>

              {/* Email Delivery Explanation Banner */}
              <div className="max-w-md mx-auto p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-left text-xs space-y-1">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-indigo-600" />
                  Invitation Delivery Status
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {confirmResult.email_delivery_message}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div>
            {step === 'mapping' && (
              <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
            )}
            {step === 'preview' && (
              <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Change CSV
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 'upload' && (
              <Button
                variant="primary"
                size="md"
                onClick={() => handleRunPreview()}
                disabled={!selectedFile || isProcessing}
                isLoading={isProcessing}
                className="font-semibold text-xs"
              >
                <span>Upload & Validate</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}

            {step === 'mapping' && (
              <Button
                variant="primary"
                size="md"
                onClick={handleApplyMapping}
                disabled={!customMapping['name'] || !customMapping['email']}
                className="font-semibold text-xs"
              >
                <span>Apply Mapping & Preview</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}

            {step === 'preview' && (
              <Button
                variant="primary"
                size="md"
                onClick={handleConfirmImport}
                disabled={validApprovedRows.length === 0 || isConfirming}
                isLoading={isConfirming}
                className="font-semibold text-xs"
              >
                <span>Confirm & Import ({validApprovedRows.length} Employees)</span>
                <Check className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}

            {step === 'report' && (
              <Button variant="primary" size="md" onClick={handleClose} className="font-semibold text-xs">
                <span>Done & View Employees</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
