import './globals.css';

export const metadata = {
  title: '公众号研究助手 | WeChat Research Tool',
  description:
    '通过公众号名称发现公开文章线索,由你确认后再分析。提取、摘要、合并报告均可导出。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
