import { Body, Controller, Post } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";

class LoginDto {
  @IsString()
  login!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.loginLocal(dto.login, dto.password);
  }
}
