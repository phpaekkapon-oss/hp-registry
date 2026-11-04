import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when value matches no option */
  placeholder?: string;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Classes for the dropdown panel (e.g. a wider min width) */
  contentClassName?: string;
}

/** Radix forbids an empty-string item value, but "all / none" options are naturally ''. */
const EMPTY = '__empty__';
const enc = (v: string) => (v === '' ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? '' : v);

/**
 * Themed dropdown (replaces the native <select>, whose popup ignores the app's colors in dark mode).
 * Keyboard: type-ahead, arrows, Home/End, Enter/Space — all provided by Radix.
 */
export const Select: React.FC<SelectProps> = ({ value, onValueChange, options, placeholder, ariaLabel, id, disabled, className, contentClassName }) => (
  <RadixSelect.Root value={enc(value)} onValueChange={(v) => onValueChange(dec(v))} disabled={disabled}>
    <RadixSelect.Trigger
      id={id}
      aria-label={ariaLabel}
      className={cn(
        'pf-field inline-flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-3 text-left text-sm',
        'data-[placeholder]:text-slate-500 dark:data-[placeholder]:text-slate-400',
        className
      )}
    >
      <span className="min-w-0 truncate">
        {/* Render the chosen label ourselves: otherwise Radix portals the item text into this span, and swapping
            the option list (or browser auto-translate) then crashes React with "removeChild ... not a child" */}
        <RadixSelect.Value placeholder={placeholder}>{options.find((o) => enc(o.value) === enc(value))?.label}</RadixSelect.Value>
      </span>
      <RadixSelect.Icon>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
    <RadixSelect.Portal>
      <RadixSelect.Content
        position="popper"
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          'pf-menu z-[130] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl',
          contentClassName
        )}
      >
        <RadixSelect.Viewport className="p-1">
          {options.map((o) => (
            <RadixSelect.Item
              key={o.value}
              value={enc(o.value)}
              className="pf-item relative flex min-h-[40px] cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
            >
              <span className="absolute left-2.5 inline-flex w-4 items-center justify-center">
                <RadixSelect.ItemIndicator>
                  <Check className="h-4 w-4" aria-hidden />
                </RadixSelect.ItemIndicator>
              </span>
              <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
            </RadixSelect.Item>
          ))}
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>
);
