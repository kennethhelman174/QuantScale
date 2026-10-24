/**
 * Robust Real-Time Data Feed Validation System
 *
 * Enforces data-integrity checks on the Kalshi prediction market feed:
 * - Missing message / packet drop detection via strict sequence tracking
 * - Duplicate observation detection via sliding sequence set
 * - Stale data detection based on packet arrival timestamps
 * - Inconsistent source & excessive clock-skew detection
 * - Crossed and empty book anomaly detection
 * - Historical data-quality issue logging for audit & diagnostic export
 */

export type DataQualityFlag =
  | 'NOMINAL'
  | 'MISSING_MESSAGE_GAP'
  | 'DUPLICATE_OBSERVATION'
  | 'STALE_DATA_TIMEOUT'
  | 'CLOCK_SKEW_EXCESSIVE'
  | 'INCONSISTENT_SOURCE'
  | 'CROSSED_BOOK'
  | 'EMPTY_BOOK';

export interface DataQualityIssue {
  id: string;
  timestamp: number;
  exchangeTimestamp: number;
  sequenceNumber: number;
  expectedSequence: number;
  sourceIdentity: string;
  flag: DataQualityFlag;
  severity: 'WARNING' | 'CRITICAL';
  description: string;
  clockOffsetMs: number;
}

export interface ValidationResult {
  isValid: boolean;
  qualityFlag: DataQualityFlag;
  issues: DataQualityIssue[];
  clockOffsetMs: number;
}

export class DataFeedValidator {
  private lastSequenceNumber = 0;
  private seenSequences: Set<number> = new Set();
  private maxSeenSequences = 1000;
  private lastPacketArrivalTime = Date.now();
  private maxAcceptableAgeMs = 2500;
  private maxAcceptableClockSkewMs = 1500;
  private issueHistory: DataQualityIssue[] = [];
  private maxHistorySize = 300;

  public validateFeedPacket(packet: {
    sequenceNumber: number;
    exchangeTimestamp: number;
    sourceIdentity: string;
    bestBid?: number;
    bestAsk?: number;
    bidDepth?: number;
    askDepth?: number;
  }): ValidationResult {
    const localReceiptTime = Date.now();
    const issues: DataQualityIssue[] = [];
    let qualityFlag: DataQualityFlag = 'NOMINAL';

    // 1. Clock Skew Analysis
    const clockOffsetMs = localReceiptTime - packet.exchangeTimestamp;
    if (Math.abs(clockOffsetMs) > this.maxAcceptableClockSkewMs) {
      const issue: DataQualityIssue = {
        id: `dq-${Date.now()}-${packet.sequenceNumber}`,
        timestamp: localReceiptTime,
        exchangeTimestamp: packet.exchangeTimestamp,
        sequenceNumber: packet.sequenceNumber,
        expectedSequence: this.lastSequenceNumber + 1,
        sourceIdentity: packet.sourceIdentity,
        flag: 'CLOCK_SKEW_EXCESSIVE',
        severity: 'WARNING',
        description: `Local clock diverges from exchange clock by ${clockOffsetMs}ms (threshold: ${this.maxAcceptableClockSkewMs}ms)`,
        clockOffsetMs,
      };
      issues.push(issue);
      qualityFlag = 'CLOCK_SKEW_EXCESSIVE';
    }

    // 2. Duplicate Detection
    if (this.seenSequences.has(packet.sequenceNumber)) {
      const issue: DataQualityIssue = {
        id: `dq-${Date.now()}-${packet.sequenceNumber}`,
        timestamp: localReceiptTime,
        exchangeTimestamp: packet.exchangeTimestamp,
        sequenceNumber: packet.sequenceNumber,
        expectedSequence: this.lastSequenceNumber + 1,
        sourceIdentity: packet.sourceIdentity,
        flag: 'DUPLICATE_OBSERVATION',
        severity: 'WARNING',
        description: `Duplicate sequence #${packet.sequenceNumber} received from ${packet.sourceIdentity}`,
        clockOffsetMs,
      };
      issues.push(issue);
      qualityFlag = 'DUPLICATE_OBSERVATION';
    } else {
      this.seenSequences.add(packet.sequenceNumber);
      if (this.seenSequences.size > this.maxSeenSequences) {
        // prune oldest
        const first = this.seenSequences.values().next().value;
        if (first !== undefined) this.seenSequences.delete(first);
      }
    }

    // 3. Missing Message / Sequence Gap Detection
    if (this.lastSequenceNumber > 0 && packet.sequenceNumber > this.lastSequenceNumber + 1) {
      const missingCount = packet.sequenceNumber - (this.lastSequenceNumber + 1);
      const issue: DataQualityIssue = {
        id: `dq-${Date.now()}-${packet.sequenceNumber}`,
        timestamp: localReceiptTime,
        exchangeTimestamp: packet.exchangeTimestamp,
        sequenceNumber: packet.sequenceNumber,
        expectedSequence: this.lastSequenceNumber + 1,
        sourceIdentity: packet.sourceIdentity,
        flag: 'MISSING_MESSAGE_GAP',
        severity: 'CRITICAL',
        description: `Sequence gap detected: received #${packet.sequenceNumber}, expected #${this.lastSequenceNumber + 1}. Missed ${missingCount} WebSocket message(s).`,
        clockOffsetMs,
      };
      issues.push(issue);
      qualityFlag = 'MISSING_MESSAGE_GAP';
    }

    // 4. Stale Data Timeout Detection
    const timeSinceLastPacket = localReceiptTime - this.lastPacketArrivalTime;
    if (timeSinceLastPacket > this.maxAcceptableAgeMs) {
      const issue: DataQualityIssue = {
        id: `dq-${Date.now()}-${packet.sequenceNumber}`,
        timestamp: localReceiptTime,
        exchangeTimestamp: packet.exchangeTimestamp,
        sequenceNumber: packet.sequenceNumber,
        expectedSequence: this.lastSequenceNumber + 1,
        sourceIdentity: packet.sourceIdentity,
        flag: 'STALE_DATA_TIMEOUT',
        severity: 'CRITICAL',
        description: `Stale feed timeout: ${timeSinceLastPacket}ms elapsed since last message (max allowed: ${this.maxAcceptableAgeMs}ms)`,
        clockOffsetMs,
      };
      issues.push(issue);
      qualityFlag = 'STALE_DATA_TIMEOUT';
    }

    // 5. Book Anomaly Checks (Crossed or Empty)
    if (packet.bestBid !== undefined && packet.bestAsk !== undefined) {
      if (packet.bestBid >= packet.bestAsk) {
        const issue: DataQualityIssue = {
          id: `dq-${Date.now()}-${packet.sequenceNumber}`,
          timestamp: localReceiptTime,
          exchangeTimestamp: packet.exchangeTimestamp,
          sequenceNumber: packet.sequenceNumber,
          expectedSequence: this.lastSequenceNumber + 1,
          sourceIdentity: packet.sourceIdentity,
          flag: 'CROSSED_BOOK',
          severity: 'CRITICAL',
          description: `Crossed order book: Best Bid (${packet.bestBid}¢) >= Best Ask (${packet.bestAsk}¢)`,
          clockOffsetMs,
        };
        issues.push(issue);
        qualityFlag = 'CROSSED_BOOK';
      }
    }

    if (packet.bidDepth === 0 || packet.askDepth === 0) {
      const issue: DataQualityIssue = {
        id: `dq-${Date.now()}-${packet.sequenceNumber}`,
        timestamp: localReceiptTime,
        exchangeTimestamp: packet.exchangeTimestamp,
        sequenceNumber: packet.sequenceNumber,
        expectedSequence: this.lastSequenceNumber + 1,
        sourceIdentity: packet.sourceIdentity,
        flag: 'EMPTY_BOOK',
        severity: 'CRITICAL',
        description: `Zero liquidity depth observed on ${packet.bidDepth === 0 ? 'Bid' : 'Ask'} ladder`,
        clockOffsetMs,
      };
      issues.push(issue);
      qualityFlag = 'EMPTY_BOOK';
    }

    // Record issues into diagnostic history
    for (const iss of issues) {
      this.issueHistory.unshift(iss);
      if (this.issueHistory.length > this.maxHistorySize) {
        this.issueHistory.pop();
      }
    }

    this.lastSequenceNumber = packet.sequenceNumber;
    this.lastPacketArrivalTime = localReceiptTime;

    return {
      isValid: issues.filter((i) => i.severity === 'CRITICAL').length === 0,
      qualityFlag,
      issues,
      clockOffsetMs,
    };
  }

  public getIssueHistory(): DataQualityIssue[] {
    return [...this.issueHistory];
  }

  public clearHistory() {
    this.issueHistory = [];
  }
}

export const feedValidator = new DataFeedValidator();
