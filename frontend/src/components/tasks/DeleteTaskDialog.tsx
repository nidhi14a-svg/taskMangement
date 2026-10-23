'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/common/Dialog';
import { Button } from '@/components/common/Button';
import { taskService } from '@/api/services/taskService';
import { Task } from '@/types';
import { AlertTriangle } from 'lucide-react';

export interface DeleteTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSuccess?: () => void;
}

export const DeleteTaskDialog: React.FC<DeleteTaskDialogProps> = ({
  isOpen,
  onClose,
  task,
  onSuccess,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!task) return null;

  const taskId = task.id || task._id || '';

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      await taskService.deleteTask(taskId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('task-deleted', { detail: { taskId } }));
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          'Failed to delete task. Ensure you have administrator or creator permissions.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isDeleting) {
          setError(null);
          onClose();
        }
      }}
      title="Delete Task"
      description="Permanent action confirmation"
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg leading-relaxed font-medium"
          >
            {error}
          </div>
        )}

        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Are you sure you want to delete this task?</p>
            <p className="mt-1 text-amber-800">
              Task <span className="font-bold">&ldquo;{task.title}&rdquo;</span> will be permanently removed. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleDelete}
            isLoading={isDeleting}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            Delete Task
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
