import './globals.css';
import { BackgroundCanvas } from '@/components/background/BackgroundCanvas';

export const metadata = {
  title: '公众号与网页研究助手 | WeChat Research Tool',
  description:
    '支持公众号文章与普通网页的提取、摘要、批量分析和合并报告导出。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <BackgroundCanvas />
        {children}
      </body>
    </html>
  );
}
