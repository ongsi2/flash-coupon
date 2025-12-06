import {Injectable} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService {
    private client: Redis;

    constructor(private readonly configService: ConfigService) {
        this.client = new Redis({
            host: this.configService.get('REDIS_HOST') || '127.0.0.1',
            port: this.configService.get('REDIS_PORT') || 6379,
        });
    }

    getClient() {
        return this.client;
    }

    async onModuleInit() {
        console.log('Redis ping:', await this.client.ping());
    }

}
