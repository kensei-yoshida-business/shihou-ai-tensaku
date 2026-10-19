import Link from "next/link";
import { prisma } from "@/lib/db";
import { getEntitlement, tantoRemainingToday } from "@/lib/entitlements";
import { requireUserId } from "@/lib/session";
import { PortalButton } from "@/components/PlanButton";

const PLAN_LABEL: Record<string, string> = { standard: "スタンダード（月10通）", unlimited: "無制限" };

export default async function AccountPage() {
  const userId = await requireUserId("/account");
  const [user, e, tanto, sub] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getEntitlement(userId),
    tantoRemainingToday(userId),
    prisma.subscription.findUnique({ where: { userId } }),
  ]);

  const rows: [string, string][] = [
    ["メールアドレス", user.email],
    [
      "添削チケット",
      e.ticketBalance < 0
        ? `0枚（返金済みのチケットを${-e.ticketBalance}枚使用済みのため、次回購入分から差し引きます）`
        : `${e.ticketBalance}枚`,
    ],
    [
      "月額プラン",
      sub && e.subActive
        ? `${PLAN_LABEL[sub.plan] ?? sub.plan}（次回更新 ${sub.currentPeriodEnd.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）`
        : "未登録",
    ],
    ["今月の残り添削枠", e.subActive ? (e.subRemaining === null ? "無制限" : `${e.subRemaining}通`) : "—"],
    ["短答一問一答", tanto === null ? "無制限" : `本日あと${tanto}問`],
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">会員情報</h1>
      <dl className="divide-y divide-line rounded-xl border border-line bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-3 text-sm">
            <dt className="w-40 shrink-0 text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-4">
        {user.stripeCustomerId && <PortalButton />}
        <Link href="/pricing" className="text-sm text-brand underline">
          チケットを購入する
        </Link>
      </div>
    </div>
  );
}
