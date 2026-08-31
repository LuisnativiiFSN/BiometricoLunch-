import { IsString, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SaveWeeklyCutoffsDto {
  @IsString()
  @Matches(TIME_PATTERN)
  cutoffTime!: string;
}
