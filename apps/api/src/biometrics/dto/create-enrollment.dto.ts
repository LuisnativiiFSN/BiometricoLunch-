import { Transform } from 'class-transformer';
import {
  IsBase64,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BIOMETRIC_TEMPLATE_FORMAT,
  FINGER_POSITIONS,
} from '../biometric.constants.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEnrollmentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  authorizationToken!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeCode!: string;

  @IsString()
  @IsIn(FINGER_POSITIONS)
  fingerPosition!: string;

  @IsString()
  @IsIn([BIOMETRIC_TEMPLATE_FORMAT])
  templateFormat!: string;

  @IsString()
  @IsBase64()
  @MaxLength(90_000)
  templateData!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  quality!: number;
}
