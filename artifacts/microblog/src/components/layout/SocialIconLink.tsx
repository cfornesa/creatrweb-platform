import { Globe, Linkedin } from "lucide-react";
import {
  SiInstagram,
  SiX,
  SiYoutube,
  SiTiktok,
  SiTwitch,
  SiGithub,
} from "react-icons/si";
// LinkedIn falls back to lucide because the installed react-icons
// version doesn't export `SiLinkedin`.
import type { ComponentType, SVGProps } from "react";

const ICONS: Record<
  string,
  { Icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }
> = {
  instagram: { Icon: SiInstagram, label: "Instagram" },
  twitter: { Icon: SiX, label: "X (Twitter)" },
  youtube: { Icon: SiYoutube, label: "YouTube" },
  tiktok: { Icon: SiTiktok, label: "TikTok" },
  twitch: { Icon: SiTwitch, label: "Twitch" },
  github: { Icon: SiGithub, label: "GitHub" },
  linkedin: {
    Icon: Linkedin as ComponentType<SVGProps<SVGSVGElement>>,
    label: "LinkedIn",
  },
  globe: { Icon: Globe as ComponentType<SVGProps<SVGSVGElement>>, label: "Website" },
};

export const SOCIAL_PLATFORM_KEYS = [
  "instagram",
  "twitter",
  "youtube",
  "tiktok",
  "twitch",
  "github",
  "linkedin",
] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORM_KEYS)[number];

export function SocialIconLink({
  platform,
  url,
}: {
  platform: string;
  url: string;
}) {
  const meta = ICONS[platform];
  if (!meta) return null;
  const { Icon, label } = meta;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      data-testid={`footer-social-${platform}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}
