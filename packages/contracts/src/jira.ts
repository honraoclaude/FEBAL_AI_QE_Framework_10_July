import type { TenantId } from './tenancy.js';

/** JIRA synchronization contracts. */

export type SyncMode = 'AUTO' | 'MANUAL' | 'SCHEDULED' | 'INCREMENTAL';

export type SyncDirection = 'PULL' | 'PUSH' | 'BIDIRECTIONAL';

export interface JiraConnection {
  tenantId: TenantId;
  baseUrl: string;
  /** OAuth 2.0 (3LO) — tokens live in the secrets manager, never in this record. */
  oauthClientId: string;
  projectKeys: string[];
  boardId?: string;
  connected: boolean;
  lastSyncAt?: string;
  scheduleCron?: string;
  direction: SyncDirection;
}

export interface SyncConflict {
  workItemId: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  detectedAt: string;
  resolution?: 'LOCAL_WINS' | 'REMOTE_WINS' | 'MANUAL';
}

export interface SyncResult {
  id: string;
  tenantId: TenantId;
  mode: SyncMode;
  direction: SyncDirection;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  pushed: number;
  updated: number;
  conflicts: SyncConflict[];
  errors: string[];
}
