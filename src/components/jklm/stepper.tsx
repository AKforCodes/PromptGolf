interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  fillColor: string;
  disabled?: boolean;
  onChange: (n: number) => void;
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  ariaLabel,
  fillColor,
  disabled,
  onChange,
}: StepperProps) {
  const bump = (delta: number) => {
    if (disabled) return;
    onChange(clamp(value + delta * step, min, max));
  };

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-2xl border-[3px] border-ink bg-cream shadow-chunky-sm">
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${ariaLabel}`}
        className="press flex h-12 w-12 items-center justify-center border-r-[3px] border-ink bg-white font-heading text-2xl font-bold cursor-pointer disabled:cursor-not-allowed disabled:bg-ink/5 disabled:text-ink/30"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10), min, max))}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-12 w-20 text-center font-heading text-2xl font-bold outline-none disabled:bg-ink/5 disabled:text-ink/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ backgroundColor: disabled ? undefined : fillColor }}
      />
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={disabled || value >= max}
        aria-label={`Increase ${ariaLabel}`}
        className="press flex h-12 w-12 items-center justify-center border-l-[3px] border-ink bg-white font-heading text-2xl font-bold cursor-pointer disabled:cursor-not-allowed disabled:bg-ink/5 disabled:text-ink/30"
      >
        +
      </button>
    </div>
  );
}
