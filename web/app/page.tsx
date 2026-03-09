import TimetableApp from "@/app/components/TimetableApp";
import { loadSchedule } from "@/lib/load-schedule";

export default async function Page() {
  let schedule;
  try {
    schedule = await loadSchedule();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--surface)" }}>
        <div
          className="max-w-xl w-full rounded-2xl p-5"
          style={{
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <h1 className="text-[17px] font-semibold">课表数据加载失败</h1>
          <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {msg}
          </p>
          <ul className="text-[13px] mt-3 list-disc pl-5" style={{ color: "var(--text-secondary)" }}>
            <li>网络是否可访问 GitHub raw</li>
            <li>SCHEDULE_URL / NEXT_PUBLIC_SCHEDULE_URL 是否配置正确</li>
            <li>目标 JSON 是否符合 timetable 项目的 data/schedule.json 格式</li>
          </ul>
        </div>
      </main>
    );
  }

  return <TimetableApp schedule={schedule} />;
}
