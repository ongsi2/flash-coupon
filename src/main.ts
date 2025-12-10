import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');
  const swaggerPath = `${basePath ? `${basePath}/` : ''}api/docs`.replace(/^\/+/, '');
  const globalPrefix = basePath.replace(/^\/+/, '');

  if (globalPrefix) {
    app.setGlobalPrefix(globalPrefix);
  }

  // CORS 설정 (모든 origin 허용 - 개발용)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
      new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          skipMissingProperties: false,
          skipNullProperties: false,
          skipUndefinedProperties: false,
      })
  );

  const config = new DocumentBuilder()
      .setTitle('Flash Coupon API')
      .setDescription('쿠폰 발급/사용 API 문서')
      .setVersion('1.0')
      .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
