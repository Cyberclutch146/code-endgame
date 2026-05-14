'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useMarketStore } from '@/stores/market';
import { useSignalStore } from '@/stores/signals';

interface Props {
  symbol: string;
}

export function PriceChart({ symbol }: Props) {
  const chartRef    = useRef<HTMLDivElement>(null);
  const chart       = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const candles = useMarketStore(s => s.candles[symbol] ?? []);
  const signals = useSignalStore(s => s.signals.filter(sig => sig.symbol === symbol));

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;
    chart.current = createChart(chartRef.current, {
      layout: {
        background: { color: '#0d0e12' },
        textColor:  '#9ca3af',
      },
      grid: {
        vertLines:   { color: '#1f2028' },
        horzLines:   { color: '#1f2028' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2d2f3a' },
      timeScale: {
        borderColor:    '#2d2f3a',
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
    });

    candleSeries.current = chart.current.addSeries(CandlestickSeries, {
      upColor:   '#22c55e',
      downColor: '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:   '#22c55e',
      wickDownColor: '#ef4444',
    });

    volumeSeries.current = chart.current.addSeries(HistogramSeries, {
      color:   '#3b82f640',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.current.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const handleResize = () => {
      if (chartRef.current && chart.current) {
        chart.current.applyOptions({
          width:  chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.current?.remove();
    };
  }, []);

  // Update candle data
  useEffect(() => {
    if (!candleSeries.current || !volumeSeries.current || candles.length === 0) return;
    setIsLoading(false);

    const candleData = candles.map(c => ({
      time:  (new Date(c.open_time).getTime() / 1000) as UTCTimestamp,
      open:  Number(c.open),
      high:  Number(c.high),
      low:   Number(c.low),
      close: Number(c.close),
    })).sort((a, b) => a.time - b.time);

    const volumeData = candles.map(c => ({
      time:  (new Date(c.open_time).getTime() / 1000) as UTCTimestamp,
      value: Number(c.volume),
      color: Number(c.close) >= Number(c.open) ? '#22c55e40' : '#ef444440',
    })).sort((a, b) => a.time - b.time);

    candleSeries.current.setData(candleData);
    volumeSeries.current.setData(volumeData);

    // Add signal markers
    const markers = signals
      .filter(s => !s.rejected && s.entry_price)
      .map(s => ({
        time:     (new Date(s.generated_at || Date.now()).getTime() / 1000) as UTCTimestamp,
        position: s.direction === 'LONG' ? 'belowBar' as const : 'aboveBar' as const,
        color:    s.direction === 'LONG' ? '#22c55e' : s.direction === 'SHORT' ? '#ef4444' : '#f59e0b',
        shape:    s.direction === 'LONG' ? 'arrowUp' as const : 'arrowDown' as const,
        text:     `${s.direction} ${Number(s.entry_price).toFixed(2)}`,
      }))
      .sort((a, b) => a.time - b.time);

    if (markers.length > 0) {
      candleSeries.current.setMarkers(markers);
    }
  }, [candles, signals]);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0e12] z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Waiting for market data…</p>
          </div>
        </div>
      )}
      <div ref={chartRef} className="w-full h-full" />
    </div>
  );
}
