import React, { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  id?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
}

/**
 * Text box with a dropdown of choices (like an Excel validation list).
 * Opening it shows every choice; typing narrows the list, and free text is still allowed.
 */
export const ComboInput: React.FC<Props> = ({ id, value, options, onChange, disabled, placeholder, inputMode, className }) => {
  const [open, setOpen] = useState(false);
  /** null = show everything; a string = the user is typing, filter by it */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query?.trim().toLowerCase() ?? '';
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  const show = () => {
    setQuery(null);
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };
  const pick = (o: string) => {
    onChange(o);
    setOpen(false);
    setQuery(null);
  };

  useEffect(() => {
    if (open && active >= 0) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  return (
    <Popover.Root open={open && shown.length > 0} onOpenChange={(o) => (o ? show() : setOpen(false))}>
      <Popover.Anchor asChild>
        <div ref={anchorRef} className="relative">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={id ? `${id}-options` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            inputMode={inputMode}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onClick={() => !disabled && !open && show()}
            onChange={(e) => {
              onChange(e.target.value);
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!open) return show();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((i) => (i + step + shown.length) % shown.length);
              } else if (e.key === 'Enter' && open && shown[active]) {
                e.preventDefault();
                pick(shown[active]);
              } else if (e.key === 'Escape' && open) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              } else if (e.key === 'Tab') {
                setOpen(false);
              }
            }}
            className={cn(className, 'pr-11')}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label="แสดงตัวเลือก"
            onClick={() => (open ? setOpen(false) : show())}
            className="absolute inset-y-0 right-1 my-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] dark:hover:text-white cursor-pointer"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="pf-menu z-[120] w-[var(--radix-popover-trigger-width)] rounded-xl p-1"
        >
          <ul ref={listRef} id={id ? `${id}-options` : undefined} role="listbox" className="max-h-72 overflow-y-auto">
            {shown.map((o, i) => (
              <li
                key={o}
                data-i={i}
                role="option"
                aria-selected={o === value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cn(
                  'flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2',
                  i === active && 'bg-slate-100 dark:bg-[var(--pf-hover)]',
                  o === value && 'font-semibold',
                )}
              >
                <Check className={cn('h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400', o !== value && 'invisible')} />
                {o}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
