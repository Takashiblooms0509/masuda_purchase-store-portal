import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "買取店管理ポータル",
  description: "店舗・顧客・買取情報を管理する業務ポータル",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
