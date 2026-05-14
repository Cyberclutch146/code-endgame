# QuantTerminal — Real-Time AI Trading Platform

QuantTerminal is a high-performance, full-stack trading terminal designed for hackathons and professional paper trading. It features real-time market data ingestion, a deterministic strategy engine, a risk management gate, and a modern React dashboard.

## 🚀 Yes, It's a Website!
The platform is a full-stack web application. Once launched, you interact with it entirely through your browser.

## 🏁 How to Launch

1.  **Get API Keys**: Sign up for a free paper trading account at [Alpaca Markets](https://alpaca.markets/) and get your API Key and Secret.
2.  **Setup `.env`**:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and paste your Alpaca keys.
3.  **Start with Docker**:
    ```bash
    docker compose up --build
    ```
4.  **Access the Platform**:
    - **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
    - **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

## 📈 Key Features

### 1. Real-Time Dashboard
A premium dark-mode interface powered by **TradingView Lightweight Charts**.
- **Live Candle Streaming**: Sub-100ms latency from market to UI.
- **Signal Markers**: Strategy signals are plotted directly on the chart.
- **Live PnL**: Watch your paper trades update in real-time as prices move.

### 2. Strategy Engine
- **Hot-Swappable**: Activate or deactivate strategies without restarting the server.
- **Deterministic**: Logic is isolated for reliability.
- **Multi-Symbol**: Run strategies across multiple tickers simultaneously.

### 3. Risk Management Gate
Every signal is checked against:
- **Daily Loss Limits**: Stops trading if your daily drawdown hits a threshold.
- **Cooldowns**: Prevents "revenge trading" by enforcing a wait period after losses.
- **Position Sizing**: Automatically calculates share size based on your equity and risk-per-trade.

### 4. Backtest Lab
- **High-Fidelity**: Uses the same logic for backtesting as live trading.
- **Advanced Metrics**: Generates Sharpe Ratio, Sortino Ratio, Max Drawdown, and Profit Factor.
- **Equity Curve**: Visualizes portfolio growth over historical periods.

## 🛠️ Tech Stack
- **Backend**: FastAPI, SQLAlchemy (Async), PostgreSQL, Redis, Alpaca-py.
- **Frontend**: Next.js 15, Tailwind CSS, Zustand, Lightweight Charts.
- **Infra**: Docker, Docker Compose.

---
*Built for the Code Endgame.*
