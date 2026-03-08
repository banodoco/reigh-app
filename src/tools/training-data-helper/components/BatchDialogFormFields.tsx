import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/primitives/label';
import { Textarea } from '@/shared/components/ui/textarea';

interface BatchDialogFormFieldsProps {
  nameId: string;
  nameValue: string;
  onNameChange: (value: string) => void;
  descriptionId: string;
  descriptionValue: string;
  onDescriptionChange: (value: string) => void;
  isSubmitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
}

export function BatchDialogFormFields({
  nameId,
  nameValue,
  onNameChange,
  descriptionId,
  descriptionValue,
  onDescriptionChange,
  isSubmitting,
  submitLabel,
  submittingLabel,
  onCancel,
  onSubmit,
}: BatchDialogFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={nameId}>Batch Name</Label>
        <Input
          id={nameId}
          value={nameValue}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Enter batch name..."
        />
      </div>
      <div>
        <Label htmlFor={descriptionId}>Description (optional)</Label>
        <Textarea
          id={descriptionId}
          value={descriptionValue}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Describe this batch..."
          rows={3}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={!nameValue.trim() || isSubmitting}
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
