import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // 外部サイトへのリダイレクトを防ぐため、同一サイト内のパスだけを戻り先にする
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/submit";
  if ((await auth())?.user?.id) redirect(redirectTo);

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line bg-white p-8 text-center">
      <h1 className="font-serif text-xl font-bold">ログイン</h1>
      <p className="mt-2 text-sm text-muted">答案の添削と学習履歴の保存にはログインが必要です。</p>
      <form
        className="mt-6"
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button className="w-full rounded-md border border-line px-4 py-2.5 font-medium hover:bg-brand-soft">
          Googleでログイン
        </button>
      </form>
    </div>
  );
}
