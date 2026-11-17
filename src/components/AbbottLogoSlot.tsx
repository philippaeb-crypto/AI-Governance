import React from 'react';
import { getApprovedBrandLogoUrl } from '../branding/abbottTheme';

interface AbbottLogoSlotProps {
  variant?: 'sidebar' | 'presentation' | 'header';
  logoUrlOverride?: string | null;
}

/**
 * Official Abbott Logo Slot.
 * Strictly renders an approved uploaded brand asset when supplied in Settings,
 * or a clean, clearly marked placeholder requesting the approved official asset.
 * Never recreates, approximates, distorts, or generates an Abbott logo mark.
 */
export const AbbottLogoSlot: React.FC<AbbottLogoSlotProps> = ({
  variant = 'sidebar',
  logoUrlOverride,
}) => {
  const logoUrl =
    logoUrlOverride !== undefined ? logoUrlOverride : getApprovedBrandLogoUrl();

  const heightClass =
    variant === 'presentation'
      ? 'h-7 max-w-[148px]'
      : variant === 'header'
        ? 'h-6 max-w-[132px]'
        : 'h-7 max-w-[164px]';

  if (logoUrl) {
    return (
      <div className="inline-flex shrink-0 items-center rounded bg-white px-1.5 py-0.5">
        <img
          src={logoUrl}
          alt="Abbott Corporate Logo"
          className={`${heightClass} w-auto object-contain`}
        />
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded border border-dashed border-[#BFD7EE] bg-[#EBF3FB]/70 px-2.5 py-1 text-[10px] font-medium tracking-wide text-[#004F9F] select-none ${
        variant === 'presentation' ? 'h-8' : 'h-7'
      }`}
      title="Official Abbott logo asset pending — upload approved SVG/PNG in Settings"
    >
      [Official Abbott Logo — Asset Pending]
    </div>
  );
};
