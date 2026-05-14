import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WSProvider } from '@/components/WSProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'QuantTerminal — Real-Time Trading Dashboard',
  description: 'AI-assisted paper trading platform with real-time signals and backtesting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-[#0a0b0e] text-gray-100 antialiased`}>
        <WSProvider>
          {children}
        </WSProvider>
      </body>
    </html>
  );
}
