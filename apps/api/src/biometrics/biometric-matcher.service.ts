import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_THRESHOLD_SCORE = Math.floor(0x7fffffff / 100000);
const MATCHER_TIMEOUT_MS = 10_000;
const MAXIMUM_OUTPUT_BYTES = 65_536;

export type MatcherCandidate = {
  enrollmentId: string;
  employeeCode: string;
  templateData: Buffer;
};

export type MatcherResult = {
  status: 'IDENTIFIED' | 'NOT_IDENTIFIED' | 'AMBIGUOUS' | 'ERROR';
  enrollmentId?: string;
  employeeCode?: string;
  score?: number;
  thresholdScore: number;
  technicalCode?: string;
};

@Injectable()
export class BiometricMatcherService {
  private readonly matcherPath: string;
  private readonly thresholdScore: number;

  constructor() {
    this.matcherPath =
      process.env.BIOMETRIC_MATCHER_PATH?.trim() ||
      fileURLToPath(
        new URL(
          '../../../../../Csharp/MarcacionComida.BiometricMatcher/bin/x64/Release/net10.0-windows/win-x64/MarcacionComida.BiometricMatcher.exe',
          import.meta.url,
        ),
      );

    const configuredThreshold = Number(
      process.env.BIOMETRIC_MATCH_THRESHOLD ?? DEFAULT_THRESHOLD_SCORE,
    );
    if (
      !Number.isSafeInteger(configuredThreshold) ||
      configuredThreshold <= 0 ||
      configuredThreshold > 0x7fffffff
    ) {
      throw new Error('BIOMETRIC_MATCH_THRESHOLD no es valido');
    }
    this.thresholdScore = configuredThreshold;
  }

  async match(
    candidateTemplate: Buffer,
    candidates: MatcherCandidate[],
  ): Promise<MatcherResult> {
    if (!existsSync(this.matcherPath)) {
      throw new ServiceUnavailableException(
        'El componente biometrico interno no esta compilado',
      );
    }

    const payload = Buffer.from(
      JSON.stringify({
        templateFormat: 'ANSI_378_2004',
        candidateTemplate: candidateTemplate.toString('base64'),
        thresholdScore: this.thresholdScore,
        candidates: candidates.map((item) => ({
          enrollmentId: item.enrollmentId,
          employeeCode: item.employeeCode,
          templateData: item.templateData.toString('base64'),
        })),
      }),
      'utf8',
    );

    try {
      const output = await this.runMatcher(payload);
      const result = JSON.parse(output) as MatcherResult;
      if (
        !['IDENTIFIED', 'NOT_IDENTIFIED', 'AMBIGUOUS', 'ERROR'].includes(
          result.status,
        ) ||
        result.thresholdScore !== this.thresholdScore
      ) {
        throw new Error('INVALID_MATCHER_RESPONSE');
      }
      return result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'No fue posible ejecutar la comparacion biometrica',
      );
    } finally {
      payload.fill(0);
    }
  }

  private runMatcher(payload: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.matcherPath, [], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const output: Buffer[] = [];
      let outputLength = 0;
      let settled = false;

      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        action();
      };

      const timeout = setTimeout(() => {
        child.kill();
        finish(() => reject(new Error('MATCHER_TIMEOUT')));
      }, MATCHER_TIMEOUT_MS);

      child.once('error', () => finish(() => reject(new Error('MATCHER_START'))));
      child.stdout.on('data', (chunk: Buffer) => {
        outputLength += chunk.length;
        if (outputLength > MAXIMUM_OUTPUT_BYTES) {
          child.kill();
          finish(() => reject(new Error('MATCHER_OUTPUT_TOO_LARGE')));
          return;
        }
        output.push(Buffer.from(chunk));
      });
      child.once('close', (code) => {
        finish(() => {
          const text = Buffer.concat(output).toString('utf8');
          for (const chunk of output) chunk.fill(0);
          if (code !== 0) {
            reject(new Error('MATCHER_FAILED'));
            return;
          }
          resolve(text);
        });
      });

      child.stdin.once('error', () => {
        finish(() => reject(new Error('MATCHER_STDIN')));
      });
      child.stdin.end(payload);
    });
  }
}
