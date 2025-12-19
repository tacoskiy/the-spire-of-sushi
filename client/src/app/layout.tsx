import type { Metadata } from "next";
import "./css/reset.css";
import "./css/globals.css";

export const metadata: Metadata = {
  title: "The Spire of 寿司",
  description: "A hand-controlled sushi stacking game",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
};