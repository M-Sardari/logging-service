import { randomUUID } from 'crypto';

export function uuidGenerator(): string {
  return randomUUID();
}
