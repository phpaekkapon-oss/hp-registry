import * as React from 'react';
import { cn } from '../../lib/utils';

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    /** Classes for the scroll container (e.g. a max height so sticky headers work) */
    containerClassName?: string;
  }
>(({ className, containerClassName, ...props }, ref) => (
  <div className={cn('relative w-full overflow-auto', containerClassName)}>
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm border-collapse', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[var(--pf-head-bg)]', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('divide-y divide-slate-200 dark:divide-white/10 [&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'transition-colors hover:bg-slate-50 dark:hover:bg-[var(--pf-hover)] data-[state=selected]:bg-slate-100 dark:data-[state=selected]:bg-[var(--pf-hover)]',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-11 px-3 text-left align-middle text-xs font-semibold text-ink-3 whitespace-nowrap',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-3 align-middle text-ink', className)}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

export {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
};
