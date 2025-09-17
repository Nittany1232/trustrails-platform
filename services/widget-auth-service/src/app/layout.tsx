/**
 * Root layout for Widget Auth Service
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TrustRails Widget Auth Service',
  description: 'Authentication service for TrustRails embeddable widget',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}