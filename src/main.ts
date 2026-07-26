import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CustomLogger } from './common/handler/custom.logger';

async function bootstrap() {
  const logger = new CustomLogger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application is running on port ${port}`);
}
bootstrap();
