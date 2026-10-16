import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './styles.css';
export const metadata: Metadata = { title: 'Law Machine', description: 'Explore how law moves through institutions, with sources at every step.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
