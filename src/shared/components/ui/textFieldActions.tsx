import * as React from "react"
import { X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { AIInputButton } from "./ai-input-button"
import { useIsMobile } from "@/shared/hooks/mobile"
import { useAIInputMode } from "@/shared/contexts/AIInputModeContext"
import { cn } from "@/shared/components/ui/contracts/cn"

export type VoiceTaskType = "transcribe_only" | "transcribe_and_write"

export interface VoiceInputResult {
  transcription: string
  prompt?: string
}

export interface ClearableVoiceFieldProps {
  clearable?: boolean
  onClear?: () => void
  /** Enable voice input button */
  voiceInput?: boolean
  /** Callback when voice transcription/prompt is ready */
  onVoiceResult?: (result: VoiceInputResult) => void
  /** Voice processing task type */
  voiceTask?: VoiceTaskType
  /** Additional context for voice prompt generation */
  voiceContext?: string
  /** Example prompt to guide AI generation */
  voiceExample?: string
  /** Callback for voice input errors */
  onVoiceError?: (error: string) => void
}

interface UseTextFieldActionsParams extends ClearableVoiceFieldProps {
  value: unknown
  defaultValue: unknown
  disabled?: boolean
}

function getTextFieldExistingValue(value: unknown, defaultValue: unknown): string {
  if (value != null) {
    return String(value)
  }
  if (defaultValue != null) {
    return String(defaultValue)
  }
  return ""
}

export function useTextFieldActions({
  value,
  defaultValue,
  clearable = false,
  onClear,
  voiceInput = false,
  onVoiceResult,
  disabled,
}: UseTextFieldActionsParams) {
  const [isHovered, setIsHovered] = React.useState(false)
  const [isAIInputActive, setIsAIInputActive] = React.useState(false)
  const isMobile = useIsMobile()
  const { mode: aiInputMode } = useAIInputMode()

  const existingValue = getTextFieldExistingValue(value, defaultValue)
  const hasValue = existingValue.length > 0
  const showClear = Boolean(clearable && onClear && hasValue)
  const showVoice = Boolean(
    voiceInput && onVoiceResult && (aiInputMode === "voice" || aiInputMode === "text")
  )
  const hasActions = showClear || showVoice
  const showButtons =
    (isMobile || isHovered || isAIInputActive) && !disabled && (showClear || showVoice)

  const handleClear = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled && onClear) {
        onClear()
      }
    },
    [disabled, onClear]
  )

  return {
    isHovered,
    setIsHovered,
    isAIInputActive,
    setIsAIInputActive,
    existingValue,
    showClear,
    showVoice,
    hasActions,
    showButtons,
    handleClear,
  }
}

interface TextFieldActionButtonsProps extends ClearableVoiceFieldProps {
  showVoice: boolean
  showClear: boolean
  existingValue: string
  disabled?: boolean
  onVoiceActiveStateChange: (isActive: boolean) => void
  onClearClick: (event: React.MouseEvent) => void
  containerClassName: string
  voiceButtonClassName?: string
  clearButtonClassName?: string
}

export function TextFieldActionButtons({
  showVoice,
  showClear,
  existingValue,
  disabled,
  onVoiceActiveStateChange,
  onClearClick,
  voiceTask = "transcribe_and_write",
  onVoiceResult,
  onVoiceError,
  voiceContext,
  voiceExample,
  containerClassName,
  voiceButtonClassName,
  clearButtonClassName,
}: TextFieldActionButtonsProps) {
  if (!showVoice && !showClear) {
    return null
  }

  return (
    <div className={containerClassName}>
      {showVoice && onVoiceResult && (
        <AIInputButton
          onResult={onVoiceResult}
          onError={onVoiceError}
          onActiveStateChange={onVoiceActiveStateChange}
          task={voiceTask}
          context={voiceContext}
          example={voiceExample}
          existingValue={existingValue}
          disabled={disabled}
          className={voiceButtonClassName}
        />
      )}
      {showClear && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClearClick}
              className={cn(
                "h-6 w-6 rounded-md bg-muted/80 hover:bg-muted flex items-center justify-center transition-colors",
                clearButtonClassName
              )}
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={5}>
            Clear this field
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
