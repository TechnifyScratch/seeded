import { notFound, redirect } from "next/navigation";
import { configured } from "@/lib/server/db";
import { emptySnapshot, getSnapshot } from "@/lib/server/snapshot";
import { HttpError } from "@/lib/server/auth";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ experiment?: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "live",
      "map",
      "memory",
      "journal",
      "timeline",
      "messages",
      "settings",
      "skills",
      "environment",
    ].includes(section)
  )
    notFound();
  let snapshot = emptySnapshot;
  if (configured()) {
    try {
      snapshot = await getSnapshot((await searchParams).experiment);
    } catch (e) {
      if (e instanceof HttpError && (e.status === 401 || e.status === 403))
        redirect("/login");
      throw e;
    }
  }
  return <Workspace section={section} initial={snapshot} />;
}
