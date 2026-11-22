import { Suspense } from "react";
import TicketClient from "./TicketClient";

// Next 16: params is a Promise and must be awaited (see node_modules/next/dist/docs,
// app/02-guides/upgrading/version-16.md). Mirrors the existing app/route/[id] pattern.
async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketClient id={id} />;
}

export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <Resolved params={params} />
    </Suspense>
  );
}
