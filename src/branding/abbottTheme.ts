import { LifecycleStatus } from '../domain/types';

/**
 * Centralized Abbott Corporate Identity & Theme Configuration.
 *
 * NOTE ON BRAND TOKENS & OFFICIAL ASSETS:
 * - Corporate-blue primary/secondary UI palette tokens below are restrained
 *   corporate-blue placeholders aligned to enterprise presentation clarity
 *   until verified against the official Abbott Corporate Identity specification.
 * - Official Abbott logo files must never be recreated, approximated, distorted,
 *   or generated. Use `AbbottLogoSlot` to render an approved asset uploaded in
 *   Settings or an explicitly marked placeholder slot.
 */
export const ABBOTT_THEME = {
  brandName: 'Abbott',
  platformTitle: 'AAS AI Governance',
  platformSubtitle: 'Enterprise AI Portfolio & Value Management',
  colors: {
    primary: '#004F9F', // Abbott corporate-blue UI placeholder
    primaryHover: '#003D7A',
    secondary: '#0066B2',
    tint: '#EBF3FB',
    tintBorder: '#BFD7EE',
    ink: '#0F172A',
    inkMuted: '#475569',
    surface: '#FFFFFF',
    surfaceMuted: '#F8FAFC',
    border: '#E2E8F0',
    success: '#047857',
    warning: '#B45309',
    danger: '#B91C1C',
  },
  stageColors: {
    [LifecycleStatus.IDEA]: '#64748B',
    [LifecycleStatus.ASSESSMENT]: '#D97706',
    [LifecycleStatus.DEVELOPMENT]: '#0066B2',
    [LifecycleStatus.PILOT]: '#4F46E5',
    [LifecycleStatus.PRODUCTION]: '#059669',
    [LifecycleStatus.MONITORING]: '#0D9488',
    [LifecycleStatus.SCALE_IMPROVE]: '#004F9F',
    [LifecycleStatus.RETIRE]: '#94A3B8',
  } as Record<LifecycleStatus, string>,
} as const;

export const DEFAULT_OFFICIAL_ABBOTT_LOGO_URL =
  '/assets/aistudio/images-2_5b1ae2b7.png';

const APPROVED_LOGO_STORAGE_KEY = 'aas_approved_abbott_logo_dataurl_v1';
const CLEARED_SENTINEL = '__CLEARED_TO_PLACEHOLDER__';

export function getApprovedBrandLogoUrl(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_OFFICIAL_ABBOTT_LOGO_URL;
  }
  try {
    const val = window.localStorage.getItem(APPROVED_LOGO_STORAGE_KEY);
    if (val === CLEARED_SENTINEL) return null;
    if (val && (val.startsWith('data:image/') || val.startsWith('/'))) {
      return val;
    }
    return DEFAULT_OFFICIAL_ABBOTT_LOGO_URL;
  } catch {
    return DEFAULT_OFFICIAL_ABBOTT_LOGO_URL;
  }
}

export function isUsingCustomBrandLogoOverride(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const val = window.localStorage.getItem(APPROVED_LOGO_STORAGE_KEY);
    return Boolean(val && val !== CLEARED_SENTINEL);
  } catch {
    return false;
  }
}

export function saveApprovedBrandLogoUrl(dataUrl: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(APPROVED_LOGO_STORAGE_KEY, dataUrl);
}

export function restoreOfficialBrandLogoUrl(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(APPROVED_LOGO_STORAGE_KEY);
}

export function clearApprovedBrandLogoUrl(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(APPROVED_LOGO_STORAGE_KEY, CLEARED_SENTINEL);
}
