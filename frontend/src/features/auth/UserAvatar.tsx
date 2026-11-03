import React, { useEffect, useState } from 'react';
import { initialOf } from '../../services/authService';
import { useAuth } from './AuthContext';

/**
 * The signed-in person's photo, or their first letter on the brand colour when there is none.
 * `className` sets size and shape (e.g. "h-8 w-8 rounded-md text-xs").
 */
export const UserAvatar: React.FC<{ name: string; className?: string }> = ({ name, className = 'h-9 w-9 rounded-lg text-sm' }) => {
  const { security } = useAuth();
  const url = security.avatarUrl;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);

  if (url && !broken) {
    return <img src={url} alt="" onError={() => setBroken(true)} className={`${className} shrink-0 bg-slate-200 object-cover ring-1 ring-black/5 dark:bg-slate-700 dark:ring-white/10`} />;
  }
  return (
    <span className={`${className} btn-brand inline-flex shrink-0 items-center justify-center font-semibold text-white`} aria-hidden>
      {initialOf(name)}
    </span>
  );
};
