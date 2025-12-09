import {Body, Controller, Get, Post} from '@nestjs/common';
import {UsersService} from "./users.service";
import {User} from "./user.entity";
import {CreateUserDto} from "./dto/create-user.dto";

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {
    }

    @Get()
    getUsers(): Promise<User[]> {
        return this.usersService.findAll();
    }

    @Post("test")
    async createTestUser(@Body() createUserDto: CreateUserDto): Promise<User>{
        return this.usersService.createTestUser(createUserDto.email, createUserDto.name);
    }
}
