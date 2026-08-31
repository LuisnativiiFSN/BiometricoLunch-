import {
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdjustMealReservationDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe usar el formato YYYY-MM-DD',
  })
  date!: string;

  @IsString()
  @IsIn(['ADD', 'CHANGE', 'CANCEL'])
  action!: 'ADD' | 'CHANGE' | 'CANCEL';

  @ValidateIf((body: AdjustMealReservationDto) => body.action !== 'CANCEL')
  @IsUUID()
  mealId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
