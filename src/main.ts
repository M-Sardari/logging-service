import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './logger/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useLogger({
    log: (message) => logger.info(message),
    error: (message) => logger.error(message),
    warn: (message) => logger.warn(message),
    debug: (message) => logger.debug(message),
    verbose: (message) => logger.verbose(message),
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
