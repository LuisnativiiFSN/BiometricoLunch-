import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DailyCutoffDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  cutoffTime!: string;
}

export class SaveWeeklyCutoffsDto {
  @IsString()
  @IsIn(['GENERAL', 'DAILY'])
  mode!: 'GENERAL' | 'DAILY';

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  generalTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => DailyCutoffDto)
  days?: DailyCutoffDto[];
}
