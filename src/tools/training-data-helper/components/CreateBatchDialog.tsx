import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { BatchDialogFormFields } from './BatchDialogFormFields';

interface CreateBatchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBatch: (name: string, description?: string) => Promise<string>;
  trigger?: React.ReactNode;
}

export function CreateBatchDialog({ isOpen, onOpenChange, onCreateBatch, trigger }: CreateBatchDialogProps) {
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDescription, setNewBatchDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return;

    setIsCreating(true);
    try {
      await onCreateBatch(newBatchName.trim(), newBatchDescription.trim() || undefined);
      setNewBatchName('');
      setNewBatchDescription('');
      onOpenChange(false);
    } catch (error) {
      normalizeAndPresentError(error, { context: 'BatchSelector', showToast: false });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Batch</DialogTitle>
        </DialogHeader>
        <BatchDialogFormFields
          nameId="batch-name"
          nameValue={newBatchName}
          onNameChange={setNewBatchName}
          descriptionId="batch-description"
          descriptionValue={newBatchDescription}
          onDescriptionChange={setNewBatchDescription}
          isSubmitting={isCreating}
          submitLabel="Create Batch"
          submittingLabel="Creating..."
          onCancel={() => onOpenChange(false)}
          onSubmit={handleCreateBatch}
        />
      </DialogContent>
    </Dialog>
  );
}
