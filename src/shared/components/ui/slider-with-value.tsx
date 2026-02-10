import { NumberField } from "@base-ui-components/react/number-field";
import { Slider } from "./slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { ChevronUp, ChevronDown } from "lucide-react";

interface SliderWithValueProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  hideLabel?: boolean;
  formatValue?: (value: number) => string;
  numberInputClassName?: string;
}

const SliderWithValue = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  variant = "primary",
  hideLabel = false,
  formatValue,
  numberInputClassName = "w-20",
}: SliderWithValueProps) => {
  const handleValueChange = (value: number) => {
    onChange(value);
  };

  const sliderContent = (
    <div className="space-y-2">
      {!hideLabel && (
        <div className="flex justify-between items-center">
          <label className="text-sm font-light">{label}</label>
        </div>
      )}
      <div className="flex gap-4">
        {formatValue ? (
          <div className={`border rounded ${numberInputClassName} h-10 flex items-center justify-center bg-card dark:bg-gray-800`}>
            {formatValue(value)}
          </div>
        ) : (
          <NumberField.Root
            value={value}
            onValueChange={(val) => {
              if (val !== null) onChange(val);
            }}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
          >
            <NumberField.Group
              className={`flex items-center border border-border rounded ${numberInputClassName} h-10 bg-card dark:bg-gray-800`}
            >
              <NumberField.Input
                className="flex-1 min-w-0 h-full bg-transparent text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none"
              />
              <div className="flex flex-col h-full border-l border-border shrink-0">
                <NumberField.Increment
                  className="flex-1 px-1.5 flex items-center justify-center hover:bg-muted/50 active:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  tabIndex={-1}
                >
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                </NumberField.Increment>
                <NumberField.Decrement
                  className="flex-1 px-1.5 flex items-center justify-center hover:bg-muted/50 active:bg-muted transition-colors border-t border-border disabled:opacity-50 disabled:cursor-not-allowed"
                  tabIndex={-1}
                >
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </NumberField.Decrement>
              </div>
            </NumberField.Group>
          </NumberField.Root>
        )}
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          onValueChange={handleValueChange}
          className="flex-1"
          disabled={disabled}
          variant={variant}
        />
      </div>
    </div>
  );

  if (hideLabel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {sliderContent}
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return sliderContent;
};

export { SliderWithValue };
