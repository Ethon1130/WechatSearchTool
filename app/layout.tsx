import './globals.css';

export const metadata = {
  title: 'WeChat Research Agent',
  description: '公众号文章调研工具 - 快速提取、整理和分析公众号内容',
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
