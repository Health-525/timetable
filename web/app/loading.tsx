export default function Loading() {
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--surface)" }}>
      <header
        className="sticky top-0 z-20 px-5 py-3 flex items-center justify-between"
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div className="h-[17px] w-[120px] rounded" style={{ backgroundColor: "var(--surface-elevated)" }} />
        <div className="h-[15px] w-[44px] rounded" style={{ backgroundColor: "var(--surface-elevated)" }} />
      </header>

      <div className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full space-y-3">
        <div className="w-[320px] max-w-[80%] h-[120px] rounded-2xl" style={{ backgroundColor: "var(--surface-elevated)" }} />
        <div className="w-[260px] max-w-[80%] h-[80px] rounded-2xl" style={{ backgroundColor: "var(--surface-elevated)" }} />
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3"
        style={{
          backgroundColor: "var(--surface)",
          borderTop: "0.5px solid var(--border)",
        }}
      >
        <div className="max-w-2xl mx-auto flex gap-2 items-center">
          <div className="flex-1 h-[40px] rounded-full" style={{ backgroundColor: "var(--surface-elevated)" }} />
          <div className="h-[40px] w-[78px] rounded-full" style={{ backgroundColor: "var(--surface-elevated)" }} />
        </div>
        <p className="text-center text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
          数据源：加载中...
        </p>
      </div>
    </main>
  );
}
