import { Injectable } from '@nestjs/common';
import { CustomLogger } from './common/handler/custom.logger';

@Injectable()
export class AppService {
  private readonly logger = new CustomLogger(AppService.name);

  getHello(): string {
    this.logger.log('Hello endpoint called');
    this.logger.warn('Sample warning log for Grafana');
    this.logger.debug('Debug details', 'demo-request-id');
    return 'Hello World!';
  }
}
