import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { SocialIconLink, SOCIAL_PLATFORM_KEYS } from "@/components/layout/SocialIconLink";

export function Footer() {
  const { data } = useSiteSettings();
  const { data: health } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey() },
  });
  const copyright = data?.copyrightLine?.trim() ?? "";
  const footerCredit = data?.footerCredit?.trim() ?? "";
  const social = (data?.ownerSocialLinks ?? {}) as Record<string, string>;
  const website = data?.ownerWebsite ?? null;

  const socialEntries = SOCIAL_PLATFORM_KEYS.flatMap((key) => {
    const url = social[key];
    return url && url.trim().length > 0 ? [[key, url] as const] : [];
  });
  const hasIcons = socialEntries.length > 0 || (website && website.length > 0);
  const year = new Date().getFullYear();
  const apiOk = health?.status === "ok";

  return (
    <footer
      className="mt-12 border-t border-border bg-background/60"
      data-testid="site-footer"
    >
      <div className="container mx-auto max-w-2xl px-4 py-6 text-sm text-muted-foreground">
        {hasIcons ? (
          <>
            <nav
              aria-label="Social links"
              className="flex flex-wrap items-center justify-center gap-1"
              data-testid="footer-social-row"
            >
              {socialEntries.map(([key, url]) => (
                <SocialIconLink key={key} platform={key} url={url} />
              ))}
              {website ? <SocialIconLink platform="globe" url={website} /> : null}
            </nav>
            <hr className="my-4 border-border" data-testid="footer-divider" />
          </>
        ) : null}

        <div className="flex flex-col items-center gap-2 text-xs sm:flex-row sm:justify-between">
          <p>
            &copy; {year}
            {copyright ? ` ${copyright}` : ""}
            {footerCredit ? ` · ${footerCredit}` : ""}
          </p>
          <div
            className="flex items-center gap-1.5"
            data-testid="footer-api-health"
          >
            <span
              className={`h-2 w-2 rounded-full ${apiOk ? "bg-green-500" : "bg-red-500"}`}
              aria-hidden="true"
            />
            <span>{apiOk ? "API Online" : "API Offline"}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
