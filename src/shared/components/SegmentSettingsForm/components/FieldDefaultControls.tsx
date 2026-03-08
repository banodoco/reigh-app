/**
 * FieldDefaultControls Component
 *
 * Shows either a "Default" badge (when using shot defaults) or two action buttons
 * (when overridden): "Reset" to clear override, "Set as Default" to save as new default.
 */

import React from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';

interface FieldDefaultControlsProps {
  isUsingDefault: boolean;
  onUseDefault?: () => void;
  onSetAsDefault?: () => void;
  isSaving?: boolean;
  badgeType?: 'default' | 'enhanced' | null;
  badgeLabel?: string;
  className?: string;
}

export const FieldDefaultControls: React.FC<FieldDefaultControlsProps> = ({
  isUsingDefault,
  onUseDefault,
  onSetAsDefault,
  isSaving,
  badgeType,
  badgeLabel,
  className = '',
}) => {
  const resolvedBadgeType = badgeType ?? (isUsingDefault ? 'default' : null);

  if (resolvedBadgeType) {
    const styles = {
      default: 'bg-primary/15 text-primary',
      enhanced: 'bg-green-500/15 text-green-600 dark:text-green-400',
    };

    const labels = {
      default: 'Default',
      enhanced: 'Enhanced',
    };

    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[resolvedBadgeType]} ${className}`}>
        {badgeLabel || labels[resolvedBadgeType]}
      </span>
    );
  }
  if (!onUseDefault && !onSetAsDefault) {
    return null;
  }
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {onUseDefault && (
        <button
          type="button"
          onClick={onUseDefault}
          disabled={isSaving}
          className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
          title="Use the shot default value"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Use Default
        </button>
      )}
      {onSetAsDefault && (
        <button
          type="button"
          onClick={onSetAsDefault}
          disabled={isSaving}
          className="text-[10px] bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
          title="Set this value as the shot default"
        >
          {isSaving ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Save className="w-2.5 h-2.5" />
          )}
          Set as Default
        </button>
      )}
    </div>
  );
};
