import { EventEmitter } from 'node:events';

/**
 * In-process event bus. The SSE endpoints (board + team page) subscribe to this;
 * services publish AFTER their transaction commits, never before.
 * With more than one server instance, replace the emitter with Postgres LISTEN/NOTIFY or Redis pub/sub.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishTeamChanged(teamId: number): void {
  bus.emit('team', teamId);
  bus.emit('board');
}

export function publishBoardChanged(): void {
  bus.emit('board');
}
