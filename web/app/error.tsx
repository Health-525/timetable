"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        <h1 className="text-[17px] font-semibold">页面出错了</h1>
        <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
          {error.message}
        </p>
        <button
          onClick={() => reset()}
          className="mt-4 px-4 py-2 text-[13px] rounded-full active:scale-95"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          重试
        </button>
      </div>
    </main>
  );
}
