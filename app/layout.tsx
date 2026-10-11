import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ダム・オリフィス流出シミュレーター",
  description: "オリフィス流出の理論式と2次元ナビエ・ストークス方程式を比較する流体シミュレーター",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
