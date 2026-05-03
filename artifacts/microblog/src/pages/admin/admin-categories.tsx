import { AdminLayout } from "@/components/admin/AdminLayout";
import { CategoriesManagementCard } from "@/components/post/CategoriesManagementCard";

export default function AdminCategoriesPage() {
  return (
    <AdminLayout
      title="Categories"
      description="The owner-managed taxonomy. Posts may belong to multiple categories; each category gets a public listing at /categories/<slug>."
    >
      <CategoriesManagementCard />
    </AdminLayout>
  );
}
