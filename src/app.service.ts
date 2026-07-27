import { Injectable, Logger } from '@nestjs/common';
import { uuidGenerator } from './common/utils/uuid';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    this.logger.log('Hello endpoint called', uuidGenerator());
    this.logger.warn('Sample warning log for Grafana');
    this.logger.debug('Debug details');
    return 'Hello World!';
  }
}
