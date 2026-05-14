'use client';
import { useEffect } from 'react';
import { tradingWS } from '@/lib/ws';

export function WSProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    tradingWS.connect();
    return () => { tradingWS.disconnect(); };
  }, []);
  return <>{children}</>;
}
