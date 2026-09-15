import type { ReactNode } from 'react';
import { cn } from '@skinny/ui';

/**
 * One row of the Account settings card: a label (with its optional hint) on the left and the
 * control on the right, stacked on narrow screens. iOS gets this shape for free from
 * `Form`/`List`; the web spells it out once here so every row lines up.
 */
export function SettingRow({
  label,
  hint,
  control,
  divided = true,
  labelFor,
}: {
  label: string;
  hint?: string;
  control: ReactNode;
  /** Every row but the first carries the hairline that separates it from the one above. */
  divided?: boolean;
  /** Set when the control is a single labellable element; a group labels itself instead. */
  labelFor?: string;
}) {
  return (
    <div
      data-testid="setting-row"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3',
        divided && 'border-border border-t',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <label
          htmlFor={labelFor}
          className={cn('type-body-medium text-foreground', labelFor && 'cursor-pointer')}
        >
          {label}
        </label>
        {hint ? <p className="type-caption text-foreground-secondary">{hint}</p> : null}
      </div>
      {control}
    </div>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/**
 * A segmented three-way picker as a real radio group: iOS uses `Picker`, which VoiceOver reads
 * as one control with a selected value, and `role="radiogroup"` is the web element with the
 * same semantics. Buttons rather than `<input type="radio">` so the selected segment can carry
 * the design system's fill without fighting a native control's own appearance — `aria-checked`
 * is what assistive tech reads either way.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="border-border bg-surface-2 flex shrink-0 rounded-md border p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'type-caption min-h-9 rounded-sm px-3 font-medium transition-colors duration-100',
              'outline-ring',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground-secondary active:bg-card',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
