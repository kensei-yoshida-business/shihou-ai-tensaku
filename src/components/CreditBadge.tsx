import Link from "next/link";
import { getEntitlement } from "@/lib/entitlements";

/** ヘッダーの残チケット・プラン表示（サーバーコンポーネント） */
export async function CreditBadge({ userId }: { userId: string }) {
  const e = await getEntitlement(userId);
  const label = e.subActive
    ? e.subRemaining === null
      ? "無制限プラン"
      : `今月あと${e.subRemaining}通`
    : `チケット ${Math.max(0, e.ticketBalance)}枚`;
  return (
    <Link
      href="/pricing"
      className="rounded-full border border-line bg-brand-soft px-3 py-1 text-xs font-medium text-brand"
    >
      {label}
    </Link>
  );
}
