import "./globals.css";

export const metadata = { title: "PulseCRM", description: "AI-powered CRM demo" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
