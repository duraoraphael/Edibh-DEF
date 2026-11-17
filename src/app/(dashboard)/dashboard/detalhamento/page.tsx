import { Suspense } from "react";
import { DetailDashboard } from "@/components/dashboard/detail-dashboard";

export default function DashboardDetailPage() {
  return (
    <Suspense fallback={null}>
      <DetailDashboard />
    </Suspense>
  );
}
