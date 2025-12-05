import {Controller, Get, Post} from '@nestjs/common';
import {UsersService} from "./users.service";
import {User} from "./user.entity";

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {
    }

    @Get()
    getUsers(): Promise<User[]> {
        return this.usersService.findAll();
    }

    @Post("test")
    async createTestUser(): Promise<User>{
        const random = Math.floor(Math.random() * 10000);
        const email = `test${random}@example.com`;
        const name = `테스트유저${random}`;

        return this.usersService.createTestUser(email, name);
    }
}
