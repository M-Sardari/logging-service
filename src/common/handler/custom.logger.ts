import { LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { uuidGenerator } from '../utils/uuid';

// ANSI color codes (pretty mode only)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

type LogLevel = 'LOG' | 'ERROR' | 'WARN' | 'DEBUG' | 'VERBOSE' | 'FATAL';

/**
 * CustomLogger
 *
 * Output modes, selected via environment variables:
 *
 *  - LOG_FORMAT=json  -> one single-line JSON object per log on stdout/stderr.
 *    This is the mode used with Grafana Alloy / Loki: the container writes JSON
 *    to stdout, Docker captures it (json-file driver), Alloy tails it via the
 *    Docker API, parses the JSON and pushes it to Loki. The app never talks to
 *    Alloy or Loki directly, so logging keeps working even if they are down.
 *
 *  - any other value  -> human-readable colored output (local development).
 *
 *  - LOG_TO_FILE=true -> additionally append plain-text logs to /var/log/app
 *    (legacy behavior, now opt-in). Uses async appends: the previous
 *    fs.appendFileSync blocked the event loop on every log line.
 *
 *  - SERVICE_NAME     -> value of the "service" field in JSON logs (default: auth).
 *
 * The public API (log/error/warn/debug/verbose/fatal with optional uuid) is
 * unchanged — no call sites need to be modified.
 */
export class CustomLogger implements LoggerService {
  private static readonly jsonMode = process.env.LOG_FORMAT === 'json';
  private static readonly fileMode = process.env.LOG_TO_FILE === 'true';
  private static readonly service =
    process.env.SERVICE_NAME || 'LOGGING-SERVICE';

  private readonly logDir = '/var/log/app';
  private readonly logFile = path.join(
    this.logDir,
    `${CustomLogger.service}.log`,
  );
  private readonly context?: string;

  constructor(context?: string) {
    this.context = context;
    if (CustomLogger.fileMode && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(message: string, uuid?: string) {
    this.writeLog('LOG', message, uuid);
  }

  error(message: string, uuid?: string) {
    this.writeLog('ERROR', `${message}`, uuid);
  }

  warn(message: string, uuid?: string) {
    this.writeLog('WARN', message, uuid);
  }

  debug(message: string, uuid?: string) {
    this.writeLog('DEBUG', message, uuid);
  }

  verbose(message: string, uuid?: string) {
    this.writeLog('VERBOSE', message, uuid);
  }

  fatal(message: string) {
    this.writeLog('FATAL', `${message}`);
  }

  /** Grafana/Loki log level (info, warn, error, ...) */
  private static toGrafanaLevel(level: LogLevel): string {
    const map: Record<LogLevel, string> = {
      LOG: 'info',
      WARN: 'warn',
      ERROR: 'error',
      FATAL: 'critical',
      DEBUG: 'debug',
      VERBOSE: 'trace',
    };
    return map[level];
  }

  private colorize(level: LogLevel, text: string): string {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return `${colors.red}${text}${colors.reset}`;
      case 'WARN':
        return `${colors.yellow}${text}${colors.reset}`;
      case 'DEBUG':
        return `${colors.magenta}${text}${colors.reset}`;
      case 'VERBOSE':
        return `${colors.cyan}${text}${colors.reset}`;
      case 'LOG':
        return `${colors.blue}${text}${colors.reset}`;
      default:
        return text;
    }
  }

  private formatLogLevel(level: LogLevel): string {
    const levelColors: Record<LogLevel, string> = {
      ERROR: `${colors.bright}${colors.red}[ERROR]${colors.reset}`,
      FATAL: `${colors.bright}${colors.red}[FATAL]${colors.reset}`,
      WARN: `${colors.bright}${colors.yellow}[WARN]${colors.reset}`,
      DEBUG: `${colors.bright}${colors.magenta}[DEBUG]${colors.reset}`,
      VERBOSE: `${colors.bright}${colors.cyan}[VERBOSE]${colors.reset}`,
      LOG: `${colors.bright}${colors.green}[LOG]${colors.reset}`,
    };
    return levelColors[level] || `[${level}]`;
  }

  private formatContext(): string {
    if (!this.context) return '';
    return `${colors.bright}${colors.white}[${this.context}]${colors.reset}`;
  }

  /** Route to the right console stream (stderr for errors, stdout otherwise). */
  private emit(level: LogLevel, line: string) {
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else if (level === 'DEBUG') {
      console.debug(line);
    } else if (level === 'VERBOSE') {
      console.info(line);
    } else {
      console.log(line);
    }
  }

  private writeLog(level: LogLevel, message: string, uuid?: string) {
    const reqId = uuid ?? uuidGenerator();
    const timestamp = new Date().toISOString();

    if (CustomLogger.jsonMode) {
      // Single-line JSON -> stdout -> Docker -> Alloy -> Loki.
      // Never make reqId a Loki label (high cardinality); it stays in the line
      // and is queried with: {service="auth"} | json | reqId="...".
      this.emit(
        level,
        JSON.stringify({
          ts: timestamp,
          level: CustomLogger.toGrafanaLevel(level),
          levelName: level,
          service: CustomLogger.service,
          environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
          context: this.context,
          reqId,
          msg: message,
        }),
      );
    } else {
      // Pretty colored output for local development
      const coloredTimestamp = `${colors.gray}[${timestamp}]${colors.reset}`;
      const coloredLevel = this.formatLogLevel(level);
      const coloredContext = this.formatContext();
      const coloredErrorId = `${colors.cyan}[${reqId}]${colors.reset}`;
      const coloredMessage = this.colorize(level, message);
      this.emit(
        level,
        `${coloredTimestamp} ${coloredContext} ${coloredLevel} ${coloredErrorId} ${coloredMessage}`,
      );
    }

    if (CustomLogger.fileMode) {
      const plainContext = this.context ? `[${this.context}]` : '';
      const plainLog = `[${timestamp}] ${plainContext} [${level}] [${reqId}] ${message}`;
      // Async append: do not block the event loop; swallow write errors so
      // logging can never crash the service.
      fs.appendFile(this.logFile, plainLog + '\n', () => undefined);
    }
  }
}
