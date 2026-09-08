import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { FINGER_POSITIONS } from '../biometric.constants.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AuthorizeEnrollmentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  operatorEmployeeCode!: string;

  @IsUUID('4')
  operatorEnrollmentId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  targetEmployeeCode!: string;

  @IsString()
  @IsIn(FINGER_POSITIONS)
  fingerPosition!: string;
}
