/**
 * DefaultableTextarea Component
 *
 * A textarea that can display a default value with a badge when no local value is set.
 * Handles the common pattern of showing shot-level defaults with visual indication.
 *
 * Semantics:
 * - `value === undefined` = show default value with badge
 * - `value === ''` = show empty (user explicitly cleared, no badge)
 * - `value === 'text'` = show user's value (no badge)
 */

import React from 'react';
import { Textarea, TextareaProps } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/primitives/label';
import { getDefaultableField } from './SegmentSettingsForm/segmentSettingsUtils';
import { FieldDefaultControls } from './SegmentSettingsForm/components/FieldDefaultControls';

type BadgeType = 'default' | 'enhanced' | null;

interface DefaultableTextareaProps extends Omit<TextareaProps, 'value' | 'onChange'> {
  /** Label text for the field */
  label: string;
  /** Current value (undefined = use default, '' = explicitly empty, string = user value) */
  value: string | undefined;
  /** Default value to show when value is undefined */
  defaultValue?: string;
  /** Whether there's a saved override in the database */
  hasDbOverride?: boolean;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when field is cleared */
  onClear?: () => void;
  /** Badge type to show (overrides automatic detection) */
  badgeType?: BadgeType;
  /** Custom badge label */
  badgeLabel?: string;
  /** Label size variant */
  labelSize?: 'xs' | 'sm';
  /** Additional class for the container */
  containerClassName?: string;
  /** Callback to use shot default value */
  onUseDefault?: () => void;
  /**
   * Callback to set current value as shot default.
   * Receives the actual displayed value (what the user sees in the field).
   */
  onSetAsDefault?: (displayValue: string) => void;
  /** Whether currently saving as default */
  isSavingDefault?: boolean;
}

export const DefaultableTextarea: React.FC<DefaultableTextareaProps> = ({
  label,
  value,
  defaultValue,
  hasDbOverride,
  onChange,
  onClear,
  badgeType: explicitBadgeType,
  badgeLabel,
  labelSize = 'xs',
  containerClassName,
  clearable = true,
  onUseDefault,
  onSetAsDefault,
  isSavingDefault,
  ...textareaProps
}) => {
  // Compute display state using the helper
  const { isUsingDefault, displayValue } = getDefaultableField(
    value,
    defaultValue,
    hasDbOverride
  );

  // Determine badge type: explicit override > automatic detection
  const badgeType: BadgeType = explicitBadgeType !== undefined
    ? explicitBadgeType
    : (isUsingDefault ? 'default' : null);

  const labelSizeClass = labelSize === 'xs' ? 'text-xs' : 'text-sm';

  return (
    <div className={containerClassName}>
      <div className="flex items-center gap-2 mb-1">
        <Label className={`${labelSizeClass} font-medium`}>{label}</Label>
        <FieldDefaultControls
          isUsingDefault={isUsingDefault}
          badgeType={badgeType}
          badgeLabel={badgeLabel}
          onUseDefault={onUseDefault}
          onSetAsDefault={onSetAsDefault ? () => onSetAsDefault(displayValue) : undefined}
          isSaving={isSavingDefault}
        />
      </div>
      <Textarea
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        clearable={clearable}
        onClear={onClear}
        {...textareaProps}
      />
    </div>
  );
};
