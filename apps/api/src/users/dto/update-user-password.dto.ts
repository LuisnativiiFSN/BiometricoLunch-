import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserPasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(72)
  password!: string;
}
