import { AdminLayout } from "@/components/admin/AdminLayout";
import { SiteCustomizationCard } from "@/components/layout/SiteCustomizationCard";
import { useSiteSettings } from "@/hooks/use-site-settings";

export default function AdminIndexPage() {
  const { data: siteSettings, isLoading } = useSiteSettings();

  return (
    <AdminLayout
      title="Site customization"
      description="Site-wide identity, copy, palette, and theme. Changes are visible to every visitor immediately."
    >
      {isLoading || !siteSettings ? (
        <p className="text-sm text-muted-foreground">Loading site settings…</p>
      ) : (
        <SiteCustomizationCard settings={siteSettings} />
      )}
    </AdminLayout>
  );
}
