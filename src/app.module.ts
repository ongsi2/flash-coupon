import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { CouponsModule } from './coupons/coupons.module';
import { RedisModule } from './redis/redis.module';

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
                // 개발용: 엔티티로 테이블 자동 생성. 운영/부하테스트에서는 반드시 false.
                synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
                // 쿼리 로깅은 부하 테스트 결과를 왜곡하므로 기본 off.
                logging: config.get<string>('DB_LOGGING', 'false') === 'true',
                // pg 드라이버 기본 풀 크기는 10이다. 동시 요청이 그보다 많으면
                // 커넥션을 기다리는 시간이 그대로 꼬리 지연이 된다.
                extra: {
                    max: Number(config.get<string>('DB_POOL_MAX', '10')),
                },
            }),
        }),

        UsersModule,

        CouponsModule,

        RedisModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
