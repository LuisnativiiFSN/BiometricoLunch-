import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestMealDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeId!: string;
}
