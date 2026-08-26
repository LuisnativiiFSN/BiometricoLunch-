import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTodayMealDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;
}
