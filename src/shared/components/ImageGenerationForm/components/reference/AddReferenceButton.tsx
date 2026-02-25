import React from "react";
import { Plus, Upload, Search } from "lucide-react";
import { cn } from '@/shared/components/ui/contracts/cn';

interface AddReferenceButtonProps {
  isDisabled: boolean;
  onAddFiles: (files: File[]) => void;
  onOpenBrowser: () => void;
}

export const AddReferenceButton: React.FC<AddReferenceButtonProps> = ({
  isDisabled,
  onAddFiles,
  onOpenBrowser,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <div className="relative aspect-square">
      <label
        className={cn(
          "w-full h-full flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg transition-all duration-200",
          isDisabled
            ? "border-gray-200 cursor-not-allowed opacity-50"
            : isDragging
            ? "border-purple-500 bg-purple-500/20 dark:bg-purple-500/30 scale-105 shadow-lg cursor-pointer"
            : "border-gray-300 cursor-pointer"
        )}
        title="Click to upload or drag & drop"
        onDragEnter={(e) => {
          e.preventDefault();
          if (!isDisabled) setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!isDisabled) {
            const files = Array.from(e.dataTransfer.files).filter((f) =>
              f.type.startsWith("image/")
            );
            if (files.length > 0) onAddFiles(files);
          }
        }}
      >
        {isDragging ? (
          <Upload className="h-6 w-6 text-purple-600 dark:text-purple-400 animate-bounce" />
        ) : (
          <div className="relative w-full h-full">
            {/* Diagonal divider */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[141%] h-px bg-gray-300 dark:bg-gray-600 rotate-45 transform origin-center" />
            </div>
            {/* Plus icon - top right */}
            <div className="absolute top-[15%] right-[15%] pointer-events-none">
              <Plus className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) onAddFiles(files);
            e.target.value = "";
          }}
          disabled={isDisabled}
        />
      </label>

      {/* Search button - bottom left */}
      {!isDragging && (
        <button
          type="button"
          className={cn(
            "absolute bottom-[15%] left-[15%] p-0.5 rounded",
            isDisabled && "cursor-not-allowed opacity-40"
          )}
          title="Search reference images"
          onClick={(e) => {
            e.preventDefault();
            if (!isDisabled) onOpenBrowser();
          }}
          disabled={isDisabled}
        >
          <Search className="h-4 w-4 text-gray-400" />
        </button>
      )}
    </div>
  );
};
