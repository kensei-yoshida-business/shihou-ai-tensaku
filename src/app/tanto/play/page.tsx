import { requireUserId } from "@/lib/session";
import { TantoPlayer } from "@/components/tanto/TantoPlayer";

export default async function TantoPlayPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();
  await requireUserId(`/tanto/play?${query}`);
  return <TantoPlayer query={query} />;
}
