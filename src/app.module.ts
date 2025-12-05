import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { CouponsModule } from './coupons/coupons.module';

@Module({
    imports: [
        // .env 로드
        ConfigModule.forRoot({
            isGlobal: true, // 어디서든 ConfigService 사용 가능
        }),

        // TypeORM + PostgreSQL 연결
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres',
                host: config.get<string>('DB_HOST'),
                port: config.get<number>('DB_PORT'),
                database: config.get<string>('DB_NAME'),
                username: config.get<string>('DB_USER'),
                password: config.get<string>('DB_PASSWORD'),
                autoLoadEntities: true, // 나중에 엔티티 자동 로딩
                synchronize: true,      // 개발용: 엔티티로 테이블 자동 생성 (운영에서는 false)
                logging: true,
            }),
        }),

        UsersModule,

        CouponsModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
