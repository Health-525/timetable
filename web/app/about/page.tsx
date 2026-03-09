import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← 返回课表查询
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">关于 Table Time</h1>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">项目介绍</h2>
            <p className="text-gray-600">
              Table Time 是一个对话式课表查询工具，通过简单的自然语言输入，
              快速查询指定日期的课程安排。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">使用方法</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>输入 today 或「今天」查询今日课程</li>
              <li>输入「明天」查询明日课程</li>
              <li>输入「周一」、「周二」等查询当周某天课程</li>
              <li>输入具体日期如 2024-03-15 查询该日课程</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">隐私说明</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <p className="text-amber-800 font-medium mb-2">⚠️ 重要提示</p>
              <p className="text-amber-700 text-sm">
                本项目仅用于展示从 JSON 格式解析的课程数据。<br />
                <strong>请勿在此系统中提交原始 PDF 文件。</strong><br />
                所有数据处理均在浏览器端完成，不会上传到任何服务器。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">开源信息</h2>
            <p className="text-gray-600 text-sm">
              本项目基于 Next.js + TypeScript + Tailwind CSS 构建。
              课表数据从配置的数据源地址获取。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}