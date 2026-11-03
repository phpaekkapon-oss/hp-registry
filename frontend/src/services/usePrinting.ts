import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * True while the page is being printed / saved as PDF.
 *
 * Charts measure themselves at screen width, so on paper they would be clipped. While this is
 * true they render at a fixed page-sized width with animations off (an animation caught at
 * frame 0 prints as an empty chart). flushSync makes the re-render finish before the browser
 * lays the page out for print.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const on = () => flushSync(() => setPrinting(true));
    const off = () => flushSync(() => setPrinting(false));

    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);

    // Some browsers only signal print through the media query
    const mq = window.matchMedia('print');
    const onMq = (e: MediaQueryListEvent) => (e.matches ? on() : off());
    mq.addEventListener('change', onMq);

    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
      mq.removeEventListener('change', onMq);
    };
  }, []);

  return printing;
}

/** Inner width of a chart card on an A4 page with 12mm side margins */
export const PRINT_CHART_WIDTH = 640;
