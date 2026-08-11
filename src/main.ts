import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerPath = 'api/docs';

  // CORS_ORIGIN이 지정되면 그 목록만 허용한다(쉼표 구분).
  // 지정하지 않으면 전체 허용 — 로컬 개발용이며 공개 배포에서는 반드시 지정할 것.
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
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
