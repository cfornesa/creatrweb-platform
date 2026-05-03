import { AdminLayout } from "@/components/admin/AdminLayout";
import { NavItemsReorderCard } from "@/components/admin/NavItemsReorder";

export default function AdminNavigationPage() {
  return (
    <AdminLayout
      title="Navigation"
      description="Drag rows to reorder. Hide rows you want to keep but not surface in the navbar."
    >
      <NavItemsReorderCard />
    </AdminLayout>
  );
}
