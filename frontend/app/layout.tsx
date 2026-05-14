import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { WSProvider } from '@/components/WSProvider';
import { Sidebar } from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  title: 'QuantTerminal — Real-Time Trading Dashboard',
  description: 'AI-assisted paper trading platform with real-time signals and backtesting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#06070a] text-gray-100 antialiased overflow-hidden selection:bg-blue-500/30`}>
        <WSProvider>
          <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gradient-to-br from-[#0a0b0e] to-[#06070a] relative">
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.015] pointer-events-none mix-blend-overlay" />
              {children}
            </main>
          </div>
        </WSProvider>
      </body>
    </html>
  );
}
