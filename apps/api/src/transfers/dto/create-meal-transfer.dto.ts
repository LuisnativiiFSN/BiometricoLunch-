import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateMealTransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  fromEmployeeCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  toEmployeeCode!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'mealDate debe usar el formato YYYY-MM-DD',
  })
  mealDate!: string;
}
