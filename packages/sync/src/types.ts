export interface SyncResult {
  pushed: number;
  pulled: number;
  deduped: number;
  errors: string[];
  timestamp: string;
}
