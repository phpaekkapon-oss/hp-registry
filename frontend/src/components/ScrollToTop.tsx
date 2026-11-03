import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopProps {
  /** The scrolling element (not the window) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Scroll distance in px before the button appears */
  threshold?: number;
}

export const ScrollToTop: React.FC<ScrollToTopProps> = ({ containerRef, threshold = 400 }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setVisible(el.scrollTop > threshold);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef, threshold]);

  const handleClick = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    containerRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="เลื่อนขึ้นด้านบน"
      title="เลื่อนขึ้นด้านบน"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`btn-brand print:hidden fixed z-30 right-4 lg:right-6 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] lg:bottom-20 w-12 h-12 rounded-full inline-flex items-center justify-center shadow-lg transition-all duration-200 cursor-pointer ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
};
