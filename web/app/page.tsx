import { Suspense } from "react";
import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <HomeClient />
    </Suspense>
  );
}
