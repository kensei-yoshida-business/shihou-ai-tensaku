import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { CreditBadge } from "@/components/CreditBadge";
import "./globals.css";

export const metadata: Metadata = {
  title: "司法試験 AI添削",
  description: "司法試験・予備試験の過去問に特化した論文式答案のAI添削と短答一問一答",
};

const NAV = [
  { href: "/submit", label: "論文添削" },
  { href: "/tanto", label: "短答一問一答" },
  { href: "/reviews", label: "添削履歴" },
  { href: "/pricing", label: "料金" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;

  return (
    <html lang="ja">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-serif text-lg font-bold text-brand">
              司法試験 AI添削
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-muted hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {userId ? (
                <>
                  <CreditBadge userId={userId} />
                  <Link href="/account" className="text-muted hover:text-ink">
                    会員情報
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button className="text-muted hover:text-ink">ログアウト</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="rounded-md bg-brand px-3 py-1.5 text-white">
                  ログイン
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-muted">
          <nav className="mb-2 flex flex-wrap gap-4">
            <Link href="/legal/terms" className="underline">利用規約</Link>
            <Link href="/legal/privacy" className="underline">プライバシーポリシー</Link>
            <Link href="/legal/tokushoho" className="underline">特定商取引法に基づく表記</Link>
          </nav>
          問題文・出題趣旨・採点実感の出典は法務省ウェブサイトです。AIによる添削・推定ランクは実際の採点結果を保証するものではありません。
        </footer>
      </body>
    </html>
  );
}
