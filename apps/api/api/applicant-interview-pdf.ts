import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ApplicantInterviewBoardMismatchError,
  ApplicantInterviewItemNotFoundError,
  buildApplicantInterviewPdf,
  getApplicantInterviewSheetData,
  type ApplicantInterviewAnswerFieldConfig,
  type ApplicantInterviewSheetConfig,
} from '@car-movers/shared/applicant-interview-sheet';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function readApiKey(request: VercelRequest) {
  const rawValue = request.headers['x-api-key'];
  return Array.isArray(rawValue) ? rawValue[0] ?? null : rawValue ?? null;
}

function hasValidApiKey(request: VercelRequest) {
  const providedApiKey = readApiKey(request);

  if (!providedApiKey) {
    return false;
  }

  const expectedApiKey = readEnv('INTERNAL_API_KEY');
  const providedBuffer = Buffer.from(providedApiKey);
  const expectedBuffer = Buffer.from(expectedApiKey);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseAnswerFields(rawValue: string | undefined): ApplicantInterviewAnswerFieldConfig[] {
  if (!rawValue?.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawValue) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('APPLICANT_INTERVIEW_PREVIOUS_ANSWERS_JSON must be a JSON array');
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Answer field config at index ${index} must be an object`);
    }

    const { label, columnId } = entry as {
      label?: unknown;
      columnId?: unknown;
    };

    if (typeof label !== 'string' || !label.trim()) {
      throw new Error(`Answer field config at index ${index} is missing label`);
    }

    if (typeof columnId !== 'string' || !columnId.trim()) {
      throw new Error(`Answer field config at index ${index} is missing columnId`);
    }

    return {
      label: label.trim(),
      columnId: columnId.trim(),
    };
  });
}

function getInterviewSheetConfig(): ApplicantInterviewSheetConfig {
  return {
    token: readEnv('MONDAY_API_TOKEN'),
    boardId: readEnv('APPLICANT_INTERVIEW_BOARD_ID'),
    columns: {
      firstName: readEnv('APPLICANT_INTERVIEW_FIRST_NAME_COLUMN_ID'),
      lastName: readEnv('APPLICANT_INTERVIEW_LAST_NAME_COLUMN_ID'),
      phone: readEnv('APPLICANT_INTERVIEW_PHONE_COLUMN_ID'),
      email: readEnv('APPLICANT_INTERVIEW_EMAIL_COLUMN_ID'),
      role: process.env.APPLICANT_INTERVIEW_ROLE_COLUMN_ID?.trim(),
      status: process.env.APPLICANT_INTERVIEW_STATUS_COLUMN_ID?.trim(),
      notes: process.env.APPLICANT_INTERVIEW_NOTES_COLUMN_ID?.trim(),
    },
    answerFields: parseAnswerFields(process.env.APPLICANT_INTERVIEW_PREVIOUS_ANSWERS_JSON),
  };
}

function readItemId(request: VercelRequest) {
  const rawValue = request.query.itemId;
  const itemId = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (!itemId?.trim()) {
    throw new Error('Missing itemId');
  }

  return itemId.trim();
}

async function readLogoBytes() {
  try {
    return await readFile(new URL('../../verify-ui/src/assets/logo2.png', import.meta.url));
  } catch {
    return null;
  }
}

function buildFilename(fullName: string, itemId: string) {
  const slug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${slug || `applicant-${itemId}`}-interview-sheet.pdf`;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'x-api-key');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (!hasValidApiKey(request)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const itemId = readItemId(request);
    const config = getInterviewSheetConfig();
    const data = await getApplicantInterviewSheetData(itemId, config);
    const logoBytes = await readLogoBytes();
    const pdf = await buildApplicantInterviewPdf(data, { logoBytes });

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${buildFilename(data.fullName, data.itemId)}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(200).send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build applicant interview PDF';
    const statusCode =
      message === 'Missing itemId'
        ? 400
        : error instanceof ApplicantInterviewItemNotFoundError || error instanceof ApplicantInterviewBoardMismatchError
          ? 404
          : 500;

    response.status(statusCode).json({ error: message });
  }
}
