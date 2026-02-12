import React from "react";
import { Images } from "lucide-react";
import { useFormReferencesContext } from "../../ImageGenerationFormContext";

interface ReferencePreviewProps {
  isLoadingReferenceData: boolean;
}

export const ReferencePreview: React.FC<ReferencePreviewProps> = ({
  isLoadingReferenceData,
}) => {
  const { styleReferenceImageDisplay: imageUrl } = useFormReferencesContext();
  const [imageLoaded, setImageLoaded] = React.useState(false);

  // Reset loading state when image URL changes
  React.useEffect(() => {
    setImageLoaded(false);
  }, [imageUrl]);

  return (
    <div className="border-2 border-solid border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden aspect-square">
      {isLoadingReferenceData ? (
        // Skeleton while hydrating reference data
        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-gray-400" />
        </div>
      ) : imageUrl ? (
        <>
          {/* Hidden image to track loading */}
          {!imageLoaded && (
            <img
              src={imageUrl}
              alt=""
              style={{ display: "none" }}
              onLoad={() => setImageLoaded(true)}
            />
          )}
          {/* Skeleton while image loads */}
          {!imageLoaded && (
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-gray-400" />
            </div>
          )}
          {/* Actual image once loaded */}
          {imageLoaded && (
            <img
              src={imageUrl}
              alt="Selected reference"
              className="w-full h-full object-contain"
            />
          )}
        </>
      ) : (
        // Empty state
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Images className="h-8 w-8 text-gray-400" />
        </div>
      )}
    </div>
  );
};
