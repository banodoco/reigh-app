import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { BatchDialogFormFields } from './BatchDialogFormFields';

interface EditBatchDialogProps {
  isOpen: boolean;
  editName: string;
  editDescription: string;
  isUpdating: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onUpdate: () => Promise<void>;
}

export function EditBatchDialog({
  isOpen,
  editName,
  editDescription,
  isUpdating,
  onOpenChange,
  onNameChange,
  onDescriptionChange,
  onUpdate,
}: EditBatchDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Batch</DialogTitle>
        </DialogHeader>
        <BatchDialogFormFields
          nameId="edit-batch-name"
          nameValue={editName}
          onNameChange={onNameChange}
          descriptionId="edit-batch-description"
          descriptionValue={editDescription}
          onDescriptionChange={onDescriptionChange}
          isSubmitting={isUpdating}
          submitLabel="Update Batch"
          submittingLabel="Updating..."
          onCancel={() => onOpenChange(false)}
          onSubmit={() => {
            void onUpdate();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
