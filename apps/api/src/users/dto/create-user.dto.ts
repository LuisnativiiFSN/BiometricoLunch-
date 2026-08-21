import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../auth/auth.constants.js';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username solo puede contener letras, números, punto, guion y guion bajo',
  })
  username!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(72)
  password!: string;

  @IsIn([UserRole.RH, UserRole.CHEF])
  role!: 'RH' | 'CHEF';
}
