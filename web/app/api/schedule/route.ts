import { loadSchedule } from "@/lib/load-schedule";

export async function GET() {
  try {
    const schedule = await loadSchedule();
    return Response.json(schedule, {
      headers: {
        // Helpful when deployed behind a CDN. Next will still manage revalidate.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "SCHEDULE_LOAD_FAILED", message },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
