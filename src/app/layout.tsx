import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/queryProvider";

export const metadata: Metadata = {
  title: "GH2028 Watch — Ghana 2028 Election Forecast",
  description:
    "Independent, poll-anchored, sentiment-adjusted forecast dashboard for Ghana's 7 December 2028 general election.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
