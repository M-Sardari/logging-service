import { LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { uuidGenerator } from '../utils/uuid';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
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
 * - LOG_FORMAT=json  -> single-line JSON on stdout (for Alloy / Docker log drivers)
 * - LOG_TO_FILE=true -> append logs to /var/log/app/<service>.log (for Promtail)
 * - SERVICE_NAME     -> service field in JSON logs and log file name
 */
export class CustomLogger implements LoggerService {
  private static readonly jsonMode = process.env.LOG_FORMAT === 'json';
  private static readonly fileMode = process.env.LOG_TO_FILE === 'true';
  private static readonly service =
    process.env.SERVICE_NAME || 'logging-service';

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
    this.writeLog('ERROR', message, uuid);
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

  fatal(message: unknown) {
    this.writeLog('FATAL', `${message}`);
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
      this.emit(
        level,
        JSON.stringify({
          ts: timestamp,
          level,
          service: CustomLogger.service,
          context: this.context,
          reqId,
          msg: message,
        }),
      );
    } else {
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
      const line = CustomLogger.jsonMode
        ? JSON.stringify({
            ts: timestamp,
            level,
            service: CustomLogger.service,
            context: this.context,
            reqId,
            msg: message,
          })
        : `[${timestamp}]${this.context ? ` [${this.context}]` : ''} [${level}] [${reqId}] ${message}`;

      fs.appendFile(this.logFile, line + '\n', () => undefined);
    }
  }
}
