'use client';

import React from 'react';
import { TaskFormModal } from './TaskFormModal';
import { Task } from '@/types';

export interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (task?: Task) => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  onTaskCreated,
}) => {
  return (
    <TaskFormModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={(task) => {
        if (onTaskCreated) onTaskCreated(task);
      }}
    />
  );
};
