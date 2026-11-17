/* Trang /admin — SERVER GUARD: CHỈ TRUC_LINH được vào.
   Server component đọc cookie phiên TRƯỚC KHI render bất cứ thứ gì:
   • Không phải TRUC_LINH (so username, không phải role chung chung) → redirect về /dang-nhap —
     không render 1 byte nội dung quản trị, không gửi bundle admin cho người khác.
   • Cookie sai / hết hạn / DB lỗi → fail-closed (coi như không đăng nhập).
   Lớp 2: bên trong AdminGate vẫn phải nhập thêm ADMIN_SECRET (cookie dl_admin). */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USER_COOKIE, currentUserFromCookie } from "@/lib/users";
import AdminGate from "@/components/AdminGate";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const jar = await cookies();
  const u = await currentUserFromCookie(jar.get(USER_COOKIE)?.value);
  if (!u || u.username !== "TRUC_LINH") {
    redirect("/dang-nhap");
  }
  return <AdminGate />;
}
