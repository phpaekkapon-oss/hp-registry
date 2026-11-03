import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-zinc-900 text-zinc-50 shadow-2xs hover:bg-zinc-800 active:bg-zinc-950',
        destructive:
          'bg-rose-600 text-white shadow-2xs hover:bg-rose-500',
        outline:
          'border border-zinc-200 bg-white text-zinc-800 shadow-2xs hover:bg-zinc-50 hover:text-zinc-950',
        secondary:
          'bg-zinc-100 text-zinc-900 hover:bg-zinc-200/80',
        ghost:
          'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950',
        link: 'text-zinc-900 underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-[48px] px-4 py-2',
        sm: 'min-h-[48px] rounded-lg px-3 text-xs',
        lg: 'min-h-[48px] rounded-xl px-6 text-sm',
        icon: 'min-h-[48px] min-w-[48px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
