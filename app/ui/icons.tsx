/* ==========================================================================
   Icons
   --------------------------------------------------------------------------
   The product used to draw most of its small marks with Unicode characters —
   `⇪` for upload, `▤` for the calendar draft, `↻` for a reschedule, `🗂` for the
   archive, `＋` for every add button. Each of those is a glyph, which means the
   font decides what it looks like: Pretendard has no `⇪`, so the upload card's
   mark fell through to whatever Hangul-shaped thing the fallback offered, `🗂`
   arrived as a full-colour emoji in the middle of a monochrome bar, and the
   fullwidth `＋` carried half a character of air on either side that no amount
   of padding could take back.

   These are the same marks drawn as geometry instead. One viewBox, one stroke
   weight, `currentColor` throughout — so an icon takes the colour and the size
   of the thing it sits in, exactly the way `CategoryIcon` already did.

   `.ui-icon` (primitives.css) carries the stroke; every icon here is just its
   paths, so a caller that needs a different weight can override it in one rule.
   ========================================================================== */

type IconProps = {
  /** Sized in `em` by default, so an icon set beside text tracks the text. */
  size?: number | string;
  className?: string;
};

function Icon({ size, className = '', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={`ui-icon ${className}`}
      viewBox="0 0 24 24"
      width={size ?? '1em'}
      height={size ?? '1em'}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Add. Replaces the fullwidth `＋`, which set two glyph widths wide. */
export const IconPlus = (props: IconProps) => (
  <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>
);

/** A document going up into the workspace: "bring what you already wrote". */
export const IconUpload = (props: IconProps) => (
  <Icon {...props}><path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></Icon>
);

/** The year's schedule as a source: a calendar with lines written on it. */
export const IconCalendarLines = (props: IconProps) => (
  <Icon {...props}><path d="M8 3v3m8-3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 6Zm3 7h5m-5 3.5h8" /></Icon>
);

/** Start again from something already settled — a reschedule, last year's copy. */
export const IconRefresh = (props: IconProps) => (
  <Icon {...props}><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" /></Icon>
);

/** Closed years. A box with a lid, not the `🗂` emoji it replaces. */
export const IconArchive = (props: IconProps) => (
  <Icon {...props}><path d="M3.5 7.5h17v2.2h-17V7.5Zm1.2 2.2h14.6V19a1 1 0 0 1-1 1H5.7a1 1 0 0 1-1-1V9.7ZM4.6 7.5 6 4.6a1 1 0 0 1 .9-.6h10.2a1 1 0 0 1 .9.6l1.4 2.9M10 13.4h4" /></Icon>
);

/** Save as PDF. A sheet leaving the printer. */
export const IconPrint = (props: IconProps) => (
  <Icon {...props}><path d="M7 9V4.5h10V9M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17M7 14.5h10V20H7v-5.5Z" /></Icon>
);

/** The AI helpers. A four-point star, drawn rather than the `✦` glyph. */
export const IconSparkle = (props: IconProps) => (
  <Icon {...props}><path d="M12 3.5c.6 4.3 2.2 6 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.5 5.9-2.2 6.5-6.5ZM18 16.2c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8Z" /></Icon>
);

/** Parts and people administration. */
export const IconSettings = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 3h5l.5 2.3 1.2.7 2.2-.7 2.5 4.3-1.7 1.6v1.6l1.7 1.6-2.5 4.3-2.2-.7-1.2.7-.5 2.3h-5L9 18.7l-1.2-.7-2.2.7-2.5-4.3 1.7-1.6v-1.6L3.1 9.6l2.5-4.3 2.2.7L9 5.3 9.5 3Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const IconMail = (props: IconProps) => (
  <Icon {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></Icon>
);

/** Search. */
export const IconSearch = (props: IconProps) => (
  <Icon {...props}><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21" /></Icon>
);

/** A file attached to an entry. */
export const IconPaperclip = (props: IconProps) => (
  <Icon {...props}><path d="M20 11.5 12.6 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.5 7.5a1.5 1.5 0 0 1-2.1-2.1l6.9-6.9" /></Icon>
);

/** Work units — separate entries stacked into one thing that is handed over. */
export const IconLayers = (props: IconProps) => (
  <Icon {...props}><path d="m12 3.5 8.5 4.2-8.5 4.2-8.5-4.2L12 3.5ZM3.5 12.2l8.5 4.2 8.5-4.2M3.5 16.4l8.5 4.1 8.5-4.1" /></Icon>
);

/* --------------------------------------------------------------------------
   Rich-text toolbar
   --------------------------------------------------------------------------
   The formatting bar used to draw its marks by typing characters: `≡` for align
   left, `≣` for centre, `•≡` and `1≡` — two glyphs pretending to be one icon —
   for the two list kinds, `▦` for a table, `↶`/`↷` for history. Set in a Korean
   UI face at 13px they came out at four different weights and three different
   optical sizes, and the two-character ones simply read as a typo. `B` and `U`
   stay as letters, which is the convention every editor uses.
   -------------------------------------------------------------------------- */

export const IconAlignLeft = (props: IconProps) => (
  <Icon {...props}><path d="M4 6h16M4 10.7h10M4 15.3h16M4 20h10" /></Icon>
);

export const IconAlignCenter = (props: IconProps) => (
  <Icon {...props}><path d="M4 6h16M7 10.7h10M4 15.3h16M7 20h10" /></Icon>
);

export const IconBulletList = (props: IconProps) => (
  <Icon {...props}><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01" strokeWidth="2.4" /></Icon>
);

export const IconNumberList = (props: IconProps) => (
  <Icon {...props}><path d="M9.5 6.5h10.5M9.5 12h10.5M9.5 17.5h10.5" /><path d="M4 5.4l1.3-.6V8m-1.5 0h2.8" strokeWidth="1.4" /><path d="M3.9 11.1a1.2 1.2 0 1 1 1.9 1.4L3.9 14.2h2.2" strokeWidth="1.4" /><path d="M3.9 16.4h2.1l-1.3 1.5a1.2 1.2 0 1 1-.8 2" strokeWidth="1.4" /></Icon>
);

export const IconTable = (props: IconProps) => (
  <Icon {...props}><path d="M4.5 5.5h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm-1 4.2h17M10 9.7V18.5" /></Icon>
);

export const IconUndo = (props: IconProps) => (
  <Icon {...props}><path d="M4 8.5h8.8a5.2 5.2 0 0 1 0 10.4H6.5M4 8.5 8 4.8M4 8.5l4 3.8" /></Icon>
);

export const IconRedo = (props: IconProps) => (
  <Icon {...props}><path d="M20 8.5h-8.8a5.2 5.2 0 0 0 0 10.4h6.3M20 8.5 16 4.8M20 8.5l-4 3.8" /></Icon>
);
