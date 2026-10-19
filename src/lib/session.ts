import { redirect } from "next/navigation";
import { auth } from "./auth";

/** サーバーコンポーネント用: 未ログインならログイン画面へ（戻り先付き） */
export async function requireUserId(nextPath: string): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return id;
}
