import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { getCurrentUser } from "@/features/auth/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Back-office frame, which replaces the site's header and footer (see globals.css). Each page checks the admin role
 * itself (layouts do not re-run on client navigation); the frame is only drawn for admins so that the 404 others get
 * looks like any other and does not reveal the back-office.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return children;
  return <AdminShell user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}>{children}</AdminShell>;
}
