import React from 'react';
import { cn } from '../../lib/utils';

export type Icon3DVariant =
  | 'rocket'
  | 'database'
  | 'users'
  | 'settings'
  | 'revenue'
  | 'search'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'sync'
  | 'download'
  | 'shield'
  | 'folder'
  | 'chart'
  | 'close';

interface Icon3DProps {
  name: Icon3DVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<Icon3DProps['size']>, string> = {
  sm: 'w-7 h-7 rounded-xl p-1',
  md: 'w-9 h-9 rounded-2xl p-1.5',
  lg: 'w-12 h-12 rounded-2xl p-2',
  xl: 'w-14 h-14 rounded-3xl p-2.5',
};

/**
 * Thematic 3D Clay & Frosted Glass Icon Engine
 * Renders volumetric 3D SVG sculptures with multi-stop specular lighting,
 * clay inner-bevels, and ambient drop shadows.
 * Can also be swapped with external .png / .glb / Spline 3D assets.
 */
export const Icon3D: React.FC<Icon3DProps> = ({
  name,
  size = 'md',
  className,
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 select-none transition-transform duration-200 group-hover:scale-105',
        'bg-gradient-to-br from-white/95 via-sky-50/90 to-blue-100/80',
        'shadow-[0_8px_16px_-4px_rgba(15,23,42,0.14),inset_0_2px_4px_rgba(255,255,255,0.95),inset_0_-3px_6px_rgba(59,130,246,0.18)]',
        'border border-white/80',
        SIZE_CLASSES[size],
        className
      )}
    >
      {/* Top Frosted Glass Specular Glint */}
      <span className="pointer-events-none absolute inset-x-1.5 top-0.5 h-1.5 rounded-full bg-gradient-to-b from-white/90 to-transparent opacity-80" />

      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_4px_6px_rgba(15,23,42,0.18)]"
      >
        <defs>
          {/* 3D Amber/Orange Plastic Gradient */}
          <linearGradient id="clayAmber" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="45%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>

          {/* 3D Pastel Sky/Cobalt Clay Gradient */}
          <linearGradient id="clayBlue" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#BAE6FD" />
            <stop offset="45%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>

          {/* 3D Deep Navy Glossy Gradient */}
          <linearGradient id="clayNavy" x1="14" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="50%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>

          {/* 3D Emerald Clay Gradient */}
          <linearGradient id="clayMint" x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A7F3D0" />
            <stop offset="50%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          {/* 3D Rose Coral Clay Gradient */}
          <linearGradient id="clayRose" x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FECDD3" />
            <stop offset="50%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#E11D48" />
          </linearGradient>

          {/* Frosted Glass Highlight */}
          <linearGradient id="glassFrost" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#E0F2FE" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {name === 'rocket' && (
          <g>
            {/* Exhaust Flame 3D Sphere */}
            <path
              d="M32 58C26 58 23 50 26 44H38C41 50 38 58 32 58Z"
              fill="url(#clayAmber)"
            />
            {/* Left & Right 3D Fins */}
            <path d="M20 36L11 45C10 46 11 49 14 49H23L20 36Z" fill="url(#clayAmber)" />
            <path d="M44 36L53 45C54 46 53 49 50 49H41L44 36Z" fill="url(#clayAmber)" />
            {/* Main 3D Fuselage Body */}
            <path
              d="M32 6C21 16 19 30 21 44H43C45 30 43 16 32 6Z"
              fill="url(#clayBlue)"
            />
            {/* Specular Highlight on Fuselage */}
            <path
              d="M29 11C24 19 23 29 24 40"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeOpacity="0.65"
            />
            {/* 3D Glass Porthole Window */}
            <circle cx="32" cy="26" r="7" fill="url(#clayNavy)" stroke="url(#glassFrost)" strokeWidth="3" />
            <circle cx="30" cy="24" r="2" fill="white" fillOpacity="0.85" />
          </g>
        )}

        {name === 'database' && (
          <g>
            {/* Bottom 3D Cylinder */}
            <rect x="12" y="38" width="40" height="14" rx="7" fill="url(#clayNavy)" />
            {/* Middle 3D Cylinder */}
            <rect x="12" y="24" width="40" height="14" rx="7" fill="url(#clayBlue)" />
            {/* Top 3D Cylinder */}
            <rect x="12" y="10" width="40" height="14" rx="7" fill="url(#clayAmber)" />
            {/* Specular Highlights & LED Dots */}
            <path d="M18 15H34" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.75" />
            <path d="M18 29H34" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.7" />
            <path d="M18 43H34" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.5" />
            <circle cx="44" cy="17" r="2.5" fill="#FFFBEB" />
            <circle cx="44" cy="31" r="2.5" fill="#E0F2FE" />
            <circle cx="44" cy="45" r="2.5" fill="#38BDF8" />
          </g>
        )}

        {name === 'users' && (
          <g>
            {/* Secondary Back User 3D Sculpture */}
            <circle cx="42" cy="20" r="8" fill="url(#clayAmber)" />
            <path
              d="M29 48C29 40.5 34.8 35 42 35C49.2 35 55 40.5 55 48C55 50.2 53.2 52 51 52H33C30.8 52 29 50.2 29 48Z"
              fill="url(#clayAmber)"
            />
            {/* Primary Front User 3D Sculpture */}
            <circle cx="25" cy="22" r="10" fill="url(#clayBlue)" />
            <circle cx="22" cy="19" r="2.5" fill="white" fillOpacity="0.75" />
            <path
              d="M9 50C9 40.6 16.2 34 25 34C33.8 34 41 40.6 41 50C41 52.8 38.8 55 36 55H14C11.2 55 9 52.8 9 50Z"
              fill="url(#clayBlue)"
            />
            <path
              d="M15 43C17 39 21 37 25 37"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.65"
            />
          </g>
        )}

        {name === 'settings' && (
          <g>
            {/* 3D Molded Gear Wheel */}
            <circle cx="32" cy="32" r="19" fill="url(#clayNavy)" />
            <circle cx="32" cy="10" r="5" fill="url(#clayNavy)" />
            <circle cx="32" cy="54" r="5" fill="url(#clayNavy)" />
            <circle cx="10" cy="32" r="5" fill="url(#clayNavy)" />
            <circle cx="54" cy="32" r="5" fill="url(#clayNavy)" />
            <circle cx="16.5" cy="16.5" r="5" fill="url(#clayNavy)" />
            <circle cx="47.5" cy="47.5" r="5" fill="url(#clayNavy)" />
            <circle cx="47.5" cy="16.5" r="5" fill="url(#clayNavy)" />
            <circle cx="16.5" cy="47.5" r="5" fill="url(#clayNavy)" />
            {/* Inner Glowing Amber Core */}
            <circle cx="32" cy="32" r="11" fill="url(#clayAmber)" />
            <circle cx="29" cy="29" r="3" fill="white" fillOpacity="0.8" />
          </g>
        )}

        {name === 'revenue' && (
          <g>
            {/* Back Coin Stack */}
            <rect x="26" y="12" width="26" height="34" rx="8" fill="url(#clayBlue)" />
            {/* Front 3D Gold/Amber Coin Sphere */}
            <circle cx="28" cy="36" r="18" fill="url(#clayAmber)" />
            <circle cx="28" cy="36" r="13" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
            <path
              d="M28 26V46M24 31H30.5C32.4 31 33.5 32.2 33.5 33.5C33.5 34.8 32.4 36 30.5 36H25.5C23.6 36 22.5 37.2 22.5 38.5C22.5 39.8 23.6 41 25.5 41H32"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        )}

        {name === 'chart' && (
          <g>
            <rect x="10" y="34" width="11" height="20" rx="5.5" fill="url(#clayBlue)" />
            <rect x="26.5" y="22" width="11" height="32" rx="5.5" fill="url(#clayNavy)" />
            <rect x="43" y="12" width="11" height="42" rx="5.5" fill="url(#clayAmber)" />
            <circle cx="48.5" cy="17" r="2" fill="white" fillOpacity="0.85" />
          </g>
        )}

        {name === 'search' && (
          <g>
            <path
              d="M39 39L52 52"
              stroke="url(#clayAmber)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle
              cx="27"
              cy="27"
              r="16"
              fill="url(#clayBlue)"
              stroke="white"
              strokeWidth="3"
            />
            <path
              d="M20 21C22 18.5 25 17.5 28 18"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeOpacity="0.85"
            />
          </g>
        )}

        {name === 'plus' && (
          <g>
            <circle cx="32" cy="32" r="22" fill="url(#clayAmber)" />
            <path
              d="M32 20V44M20 32H44"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="23" cy="21" r="2.5" fill="white" fillOpacity="0.75" />
          </g>
        )}

        {name === 'edit' && (
          <g>
            <rect
              x="12"
              y="14"
              width="38"
              height="38"
              rx="12"
              fill="url(#clayBlue)"
            />
            <path
              d="M24 40L25.5 32.5L39 19C40.5 17.5 43 17.5 44.5 19C46 20.5 46 23 44.5 24.5L31 38L24 40Z"
              fill="url(#clayAmber)"
            />
            <path
              d="M22 20H30"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeOpacity="0.75"
            />
          </g>
        )}

        {name === 'trash' && (
          <g>
            <path
              d="M18 22H46L43 50C42.7 52.8 40.3 55 37.5 55H26.5C23.7 55 21.3 52.8 21 50L18 22Z"
              fill="url(#clayRose)"
            />
            <rect x="14" y="14" width="36" height="7" rx="3.5" fill="url(#clayNavy)" />
            <path d="M27 30V45M37 30V45" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.8" />
          </g>
        )}

        {name === 'sync' && (
          <g>
            <circle cx="32" cy="32" r="22" fill="url(#clayBlue)" />
            <path
              d="M22 27C24 21.5 29.5 18 35.5 19.5C39.5 20.5 42.5 23.5 43.5 27.5M42 37C40 42.5 34.5 46 28.5 44.5C24.5 43.5 21.5 40.5 20.5 36.5"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="43.5" cy="27.5" r="3.5" fill="url(#clayAmber)" />
            <circle cx="20.5" cy="36.5" r="3.5" fill="url(#clayAmber)" />
          </g>
        )}

        {name === 'download' && (
          <g>
            <rect x="12" y="38" width="40" height="14" rx="7" fill="url(#clayNavy)" />
            <path
              d="M32 12V36M32 36L23 27M32 36L41 27"
              stroke="url(#clayAmber)"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {name === 'shield' && (
          <g>
            <path
              d="M32 8L50 15V30C50 42.5 42.2 51.8 32 56C21.8 51.8 14 42.5 14 30V15L32 8Z"
              fill="url(#clayMint)"
            />
            <path
              d="M25 32L30 37L40 26"
              stroke="white"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {name === 'folder' && (
          <g>
            <path
              d="M10 20C10 16.7 12.7 14 16 14H26L31 19H48C51.3 19 54 21.7 54 25V46C54 49.3 51.3 52 48 52H16C12.7 52 10 49.3 10 46V20Z"
              fill="url(#clayBlue)"
            />
            <rect x="14" y="25" width="36" height="23" rx="6" fill="url(#clayAmber)" />
            <path d="M21 32H35" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.8" />
          </g>
        )}

        {name === 'close' && (
          <g>
            <circle cx="32" cy="32" r="21" fill="url(#clayNavy)" />
            <path
              d="M24 24L40 40M40 24L24 40"
              stroke="white"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
