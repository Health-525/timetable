import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: "var(--surface)" }}>
      <header
        className="sticky top-0 z-20 px-5 py-3 flex items-center justify-between"
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "0.5px solid var(--border)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>
          About
        </h1>
        <Link
          href="/"
          className="text-[15px] font-normal transition-colors duration-200 hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          返回
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <section
          className="rounded-2xl p-5"
          style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            项目介绍
          </h2>
          <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
            Table Time 是一个对话式课表查询工具，通过简单的自然语言输入，快速查询指定日期的课程安排。
          </p>
        </section>

        <section
          className="rounded-2xl p-5"
          style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            使用方法
          </h2>
          <ul className="list-disc pl-5 text-[13px] mt-2 space-y-1" style={{ color: "var(--text-secondary)" }}>
            <li>输入 today 或「今天」查询今日课程</li>
            <li>输入「明天」查询明日课程</li>
            <li>输入「周一」、「周二」等查询当周某天课程</li>
            <li>输入具体日期如 2024-03-15 查询该日课程</li>
          </ul>
        </section>

        <section
          className="rounded-2xl p-5"
          style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            隐私说明
          </h2>
          <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
            本项目仅用于展示从 JSON 格式解析的课程数据。请勿在此系统中提交原始 PDF 文件。
          </p>
          <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
            当前实现为：从配置的数据源地址获取 JSON，并在本地页面内进行解析与展示。
          </p>
        </section>

        <section
          className="rounded-2xl p-5"
          style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            技术栈
          </h2>
          <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }}>
            Next.js App Router + TypeScript + Tailwind CSS
          </p>
        </section>
      </div>
    </main>
  );
}
