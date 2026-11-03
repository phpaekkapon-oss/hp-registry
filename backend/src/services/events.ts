/**
 * Change feed for the procurement registers. Every successful write publishes one event; browsers that are
 * connected to GET /api/procure/events (Server-Sent Events) get it at once and reload the affected list.
 *
 * Events carry no row data, only which register changed, so nothing leaks to users who may not open it:
 * the browser re-reads the list through the normal, permission-checked API.
 */
import { EventEmitter } from 'events';

export interface ChangeEvent {
  /** orders | contracts | incoming | guarantees | progress | notes */
  resource: string;
  action: 'create' | 'update' | 'delete';
  ids: number[];
  /** Login name and display name of whoever made the change */
  by: string;
  byName: string;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(500);

export function publishChange(event: Omit<ChangeEvent, 'at'>): void {
  bus.emit('change', { ...event, at: new Date().toISOString() } satisfies ChangeEvent);
}

export function onChange(listener: (event: ChangeEvent) => void): () => void {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}
