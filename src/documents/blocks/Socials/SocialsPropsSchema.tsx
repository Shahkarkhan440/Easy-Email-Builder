import { z } from 'zod';
import { zPadding } from '../helpers/zod';

// Supported social platforms
export const SOCIAL_PLATFORMS = [
  'facebook',
  'instagram',
  'x',
  'linkedin',
  'youtube',
  'tiktok',
  'snapchat',
  'whatsapp',
  'telegram',
  'discord',
  'reddit',
  'twitch',
  'threads',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// Icon styles
export const ICON_STYLES = [
  'no-border-black', // Glyph Dark -> glyph-dark
  'no-border-white', // Glyph Light -> glyph-light
  'origin-colorful', // Circular Dynamic Color -> circular-dynamic-color
  'with-border-black', // Circular Dark -> circular-dark
  'with-border-white', // Circular Light -> circular-light
  'with-border-line-colorful', // Circular Outline Color -> circular-outline-color
  'with-border-line-black', // Circular Outline Dark -> circular-outline-dark
  'with-border-line-white', // Circular Outline Light -> circular-outline-light
  'standard', // Standard -> standard
] as const;

export type IconStyle = (typeof ICON_STYLES)[number];

const SocialsPropsSchema = z.object({
  props: z
    .object({
      // Selected platforms
      platforms: z.array(z.enum(SOCIAL_PLATFORMS as unknown as [SocialPlatform, ...SocialPlatform[]])).optional().nullable(),
      // Icon styles
      iconStyle: z.enum(ICON_STYLES as unknown as [IconStyle, ...IconStyle[]]).optional().nullable(),
      // Icon size (square)
      iconSize: z.number().optional().nullable(),
      // Per-platform config
      socials: z
        .array(
          z.object({
            platform: z.enum(SOCIAL_PLATFORMS as unknown as [SocialPlatform, ...SocialPlatform[]]),
            url: z.string().optional().nullable(),
          })
        )
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
  style: z
    .object({
      padding: zPadding().optional().nullable(),
      backgroundColor: z.string().optional().nullable(),
      textAlign: z.enum(['left', 'center', 'right']).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export default SocialsPropsSchema;

export type SocialsProps = z.infer<typeof SocialsPropsSchema>;

