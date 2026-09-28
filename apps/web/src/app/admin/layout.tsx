import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/ui/Container";
import { getCurrentUser } from "@/features/auth/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Back-office shell under the site header. Each page checks the admin role itself (layouts do not re-run on client
 * navigation); the nav is only drawn for admins so that the 404 others get does not reveal the back-office.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return children;
  return (
    <div className="bg-surface/60 pt-[104px] pb-16 tab:pt-[124px] desk:pt-[140px] desk:pb-24">
      <Container>
        <div className="mx-auto flex max-w-[1000px] flex-col gap-8">
          <AdminNav />
          {children}
        </div>
      </Container>
    </div>
  );
}
