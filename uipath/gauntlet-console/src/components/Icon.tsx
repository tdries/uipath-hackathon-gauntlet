// Inline SVG icon library. Replaces emojis that were rendering as
// platform-dependent color glyphs (cheap-looking, especially on
// Windows / corporate boxes). All icons inherit `currentColor` so
// they tint to whatever text color the surrounding element uses.
//
// Two team icons matter most:
//   <SwordIcon />  = Red team / Attack
//   <ShieldIcon /> = Blue team / Defense
//
// The rest are small structural glyphs (audio, dropdown, etc.).

import type { SVGProps } from "react";

interface BaseProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Svg({
  size = 14,
  children,
  ...rest
}: BaseProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Red sword - Attack / Red team marker. */
export function SwordIcon({ size = 14, ...rest }: BaseProps) {
  return (
    <Svg size={size} {...rest}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {/* Blade */}
        <path d="M14.5 3.5 L20 3 L19.5 8.5 L9.5 18.5 L6 15 Z" fill="currentColor" fillOpacity="0.12" />
        {/* Hilt + guard */}
        <path d="M9.5 18.5 L5.5 22.5" />
        <path d="M4 17 L9.5 18.5 L7 21" fill="currentColor" fillOpacity="0.18" />
        {/* Highlight on blade */}
        <path d="M14 7 L9.5 13" opacity="0.55" />
      </g>
    </Svg>
  );
}

/** Blue shield - Defense / Blue team marker. */
export function ShieldIcon({ size = 14, ...rest }: BaseProps) {
  return (
    <Svg size={size} {...rest}>
      <path
        d="M12 2.5 L20.5 5 L20.5 11.5 C20.5 16 16.8 19.5 12 21.5 C7.2 19.5 3.5 16 3.5 11.5 L3.5 5 Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8 12 L11 15 L16 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Speaker on (sound enabled). */
export function SpeakerOnIcon({ size = 14, ...rest }: BaseProps) {
  return (
    <Svg size={size} {...rest}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9 L8 9 L13 5 L13 19 L8 15 L4 15 Z" fill="currentColor" fillOpacity="0.2" />
        <path d="M16.5 8.5 C18 10.5 18 13.5 16.5 15.5" />
        <path d="M19 6 C21.5 9.5 21.5 14.5 19 18" />
      </g>
    </Svg>
  );
}

/** Speaker off (muted). */
export function SpeakerOffIcon({ size = 14, ...rest }: BaseProps) {
  return (
    <Svg size={size} {...rest}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9 L8 9 L13 5 L13 19 L8 15 L4 15 Z" fill="currentColor" fillOpacity="0.2" />
        <path d="M17 9 L22 14" />
        <path d="M22 9 L17 14" />
      </g>
    </Svg>
  );
}

/** Generic chevron down (use for dropdowns). */
export function ChevronDownIcon({ size = 12, ...rest }: BaseProps) {
  return (
    <Svg size={size} {...rest}>
      <path
        d="M6 9 L12 15 L18 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Down-arrow for download buttons. */
export function DownloadIcon({ size = 14, ...rest }: BaseProps) {
  return (
    <Svg size={size} {...rest}>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L12 15" />
        <path d="M7 11 L12 16 L17 11" />
        <path d="M5 20 L19 20" />
      </g>
    </Svg>
  );
}

/** Link / external arrow - typographic alternative. Used inline with text. */
export function ExternalArrow() {
  // Kept as a Unicode arrow on purpose, not an emoji. Returning a
  // span so callers can style it the same way as before.
  return <span aria-hidden="true">{"↗"}</span>;
}
