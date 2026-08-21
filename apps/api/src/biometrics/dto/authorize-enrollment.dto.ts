import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { FINGER_POSITIONS } from '../biometric.constants.js';
import { IdentifyFingerprintDto } from './identify-fingerprint.dto.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AuthorizeEnrollmentDto extends IdentifyFingerprintDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  targetEmployeeCode!: string;

  @IsString()
  @IsIn(FINGER_POSITIONS)
  fingerPosition!: string;
}
