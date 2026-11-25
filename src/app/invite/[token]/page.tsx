import { Suspense } from "react";
import type { Metadata } from "next";
import InvitationClient, { InvitationLoading } from "./invitation-client";

export const metadata: Metadata = {
  title: "Mwaliko wa Timu",
};

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<InvitationLoading />}>
      <InvitationLoader params={params} />
    </Suspense>
  );
}

async function InvitationLoader({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <InvitationClient token={token} />;
}
