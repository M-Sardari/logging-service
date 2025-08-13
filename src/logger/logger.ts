import { createLogger, format, transports } from 'winston';
import { LokiTransport } from './loki-transport';

export const logger = createLogger({
  level: 'debug',
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new LokiTransport({ lokiUrl: 'http://localhost:8001' }),
  ],
});
