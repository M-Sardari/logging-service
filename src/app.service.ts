import { Injectable } from '@nestjs/common';
import { logger } from './logger/logger';

@Injectable()
export class AppService {
  getHello(): string {
    logger.warn('Hello World!', {
      userId: '12346',
      shiiiir: 'test-sardari',
    });
    return 'Hello World!';
  }
}
