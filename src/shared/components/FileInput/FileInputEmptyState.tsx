import { UploadCloud } from 'lucide-react';

interface FileInputEmptyStateProps {
  multiple: boolean;
  acceptTypes: Array<'image' | 'video'>;
  suppressAcceptedTypes: boolean;
}

export function FileInputEmptyState({
  multiple,
  acceptTypes,
  suppressAcceptedTypes,
}: FileInputEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-y-2 text-muted-foreground">
      <UploadCloud className="h-10 w-10" />
      <p>Drag & drop or click to upload {multiple ? 'files' : 'a file'}</p>
      {!suppressAcceptedTypes && (
        <p className="text-xs">
          Accepted: {acceptTypes.join(', ')}
        </p>
      )}
    </div>
  );
}
