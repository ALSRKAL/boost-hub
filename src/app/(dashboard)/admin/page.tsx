import AdminGuard from "@/components/admin/AdminGuard";
import DashboardPage from "../dashboard/page";

export default function AdminOverviewPage() {
  return (
    <AdminGuard>
      <DashboardPage />
    </AdminGuard>
  );
}
