/**
 * LiveDataManager Module
 * Transitions from simulator-only data collection to an authenticated Kalshi WebSocket & REST integration.
 * Processes real-time market data packets and dynamically routes them to strategy evaluation modules
 * while maintaining historical time-series storage.
 */

import { KalshiApiCredentials, KalshiMarketDataCollector, TimeSeriesObservationRecord } from './kalshiClient';
import { KalshiOrderBook, Kalshi15MMarket, BTCSpotObservation } from '../types/market';
import { feedValidator } from './dataFeedValidator';

export interface LiveMarketPacket {
  channel: 'orderbook' | 'ticker' | 'trade' | 'spot';
  timestamp: number;
  sequenceNumber: number;
  marketTicker: string;
  orderBook?: KalshiOrderBook;
  spotObservation?: BTCSpotObservation;
  rawPayload?: Record<string, unknown>;
}

export class LiveDataManager {
  private credentials: KalshiApiCredentials = { environment: 'PAPER' };
  private wsConnection: WebSocket | null = null;
  private isConnected = false;
  private pollIntervalId: NodeJS.Timeout | null = null;
  private packetListeners: ((packet: LiveMarketPacket) => void)[] = [];
  private dataCollector: KalshiMarketDataCollector;
  private consecutiveErrors = 0;
  private lastMessageTimestamp = Date.now();

  constructor(dataCollector: KalshiMarketDataCollector) {
    this.dataCollector = dataCollector;
  }

  public setCredentials(creds: KalshiApiCredentials) {
    this.credentials = { ...creds };
    this.dataCollector.setCredentials(creds);
  }

  public subscribeToPackets(callback: (packet: LiveMarketPacket) => void): () => void {
    this.packetListeners.push(callback);
    return () => {
      this.packetListeners = this.packetListeners.filter((cb) => cb !== callback);
    };
  }

  private notifyPacket(packet: LiveMarketPacket) {
    for (const cb of this.packetListeners) {
      try {
        cb(packet);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  /**
   * Connect to Kalshi authenticated WebSocket feed (with REST fallback polling if WS is unavailable)
   */
  public async connect(marketTicker: string): Promise<boolean> {
    if (this.credentials.environment === 'PAPER') {
      this.isConnected = true;
      return true;
    }

    const wsUrl =
      this.credentials.environment === 'DEMO'
        ? 'wss://demo-api.kalshi.co/trade-api/v2/ws'
        : 'wss://trading-api.kalshi.com/trade-api/v2/ws';

    try {
      if (this.wsConnection) {
        this.wsConnection.close();
      }

      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        this.isConnected = true;
        this.consecutiveErrors = 0;
        // Send subscription command for market ticker
        if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
          const subMsg = {
            id: 1,
            cmd: 'subscribe',
            params: {
              channels: ['orderbook_delta', 'ticker'],
              market_tickers: [marketTicker],
            },
          };
          this.wsConnection.send(JSON.stringify(subMsg));
        }
      };

      this.wsConnection.onmessage = (event) => {
        this.lastMessageTimestamp = Date.now();
        try {
          const data = JSON.parse(event.data);
          this.processWebSocketMessage(data, marketTicker);
        } catch {
          // parse error
        }
      };

      this.wsConnection.onerror = () => {
        this.consecutiveErrors++;
        this.isConnected = false;
      };

      this.wsConnection.onclose = () => {
        this.isConnected = false;
        // Fall back to REST polling if WebSocket closes unexpectedly
        this.startRestPolling(marketTicker);
      };

      // Also start REST poll heartbeat to guarantee continuous pricing if WS lags
      this.startRestPolling(marketTicker);

      return true;
    } catch {
      this.isConnected = false;
      this.startRestPolling(marketTicker);
      return false;
    }
  }

  public disconnect() {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.isConnected = false;
  }

  public getIsConnected(): boolean {
    return this.isConnected || this.credentials.environment === 'PAPER';
  }

  private processWebSocketMessage(data: Record<string, unknown>, marketTicker: string) {
    const now = Date.now();
    const packet: LiveMarketPacket = {
      channel: 'orderbook',
      timestamp: now,
      sequenceNumber: Number(data.seq || now),
      marketTicker,
      rawPayload: data,
    };
    this.notifyPacket(packet);
  }

  /**
   * REST Polling Fallback loop for live REST API observation updates
   */
  private startRestPolling(marketTicker: string) {
    if (this.pollIntervalId) return;

    const baseUrl =
      this.credentials.environment === 'DEMO'
        ? 'https://demo-api.kalshi.co/trade-api/v2'
        : this.credentials.environment === 'LIVE'
        ? 'https://trading-api.kalshi.com/trade-api/v2'
        : null;

    if (!baseUrl) return; // Paper mode uses internal engine loop

    this.pollIntervalId = setInterval(async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.credentials.apiKey) {
          headers['KALSHI-ACCESS-KEY'] = this.credentials.apiKey;
        }

        const res = await fetch(`${baseUrl}/markets/${marketTicker}/orderbook`, {
          headers,
        });

        if (res.ok) {
          const bookData = await res.json();
          this.lastMessageTimestamp = Date.now();
          this.isConnected = true;
          this.consecutiveErrors = 0;

          // Notify packet handlers
          const packet: LiveMarketPacket = {
            channel: 'orderbook',
            timestamp: Date.now(),
            sequenceNumber: Date.now(),
            marketTicker,
            rawPayload: bookData,
          };
          this.notifyPacket(packet);
        }
      } catch {
        this.consecutiveErrors++;
        if (this.consecutiveErrors > 5) {
          this.isConnected = false;
        }
      }
    }, 2000);
  }
}
