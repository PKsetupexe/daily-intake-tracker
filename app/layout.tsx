import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "每日摄入 · 饮食与运动记录",
  description: "在本地记录每日饮食、完整营养素与运动消耗。",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/app-icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.png",
    apple: "/app-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `
    (() => {
      try {
        const preference = localStorage.getItem("daily-intake-theme") || "system";
        const dark = preference === "dark" || (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
      } catch {}
    })();
  ` }} /></head><body>{children}</body></html>;
}
