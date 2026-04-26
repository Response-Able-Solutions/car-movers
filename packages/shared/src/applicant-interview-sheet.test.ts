import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ApplicantInterviewBoardMismatchError,
  ApplicantInterviewItemNotFoundError,
  buildApplicantInterviewPdf,
  fetchApplicantInterviewItem,
  mapApplicantInterviewSheetData,
  type ApplicantInterviewSheetConfig,
  type MondayItem,
} from './applicant-interview-sheet.ts';

const config: ApplicantInterviewSheetConfig = {
  token: 'monday-token',
  boardId: 'board-1',
  columns: {
    firstName: 'first_name',
    lastName: 'last_name',
    phone: 'phone',
    email: 'email',
    role: 'role',
    status: 'status',
    notes: 'notes',
  },
  answerFields: [
    { label: 'Why do you want this role?', columnId: 'why_role' },
    { label: 'When can you start?', columnId: 'start_date' },
  ],
};

function buildItem(overrides?: Partial<MondayItem>): MondayItem {
  return {
    id: '123',
    name: 'Fallback Applicant',
    board: { id: 'board-1' },
    column_values: [
      { id: 'first_name', text: 'Alex', value: '"Alex"' },
      { id: 'last_name', text: 'Driver', value: '"Driver"' },
      { id: 'phone', text: '+44 7700 900123', value: '"+44 7700 900123"' },
      { id: 'email', text: 'alex@example.com', value: '"alex@example.com"' },
      { id: 'role', text: 'Phone Interview', value: '"Phone Interview"' },
      { id: 'status', text: 'Applied', value: '"Applied"' },
      { id: 'notes', text: 'Strong application, available immediately.', value: '"Strong application, available immediately."' },
      { id: 'why_role', text: 'Interested in the route and team culture.', value: '"Interested in the route and team culture."' },
      { id: 'start_date', text: 'Next Monday', value: '"Next Monday"' },
    ],
    ...overrides,
  };
}

test('mapApplicantInterviewSheetData normalizes missing optional values', () => {
  const item = buildItem({
    name: 'Fallback Name',
    column_values: [
      { id: 'phone', text: null, value: null },
      { id: 'email', text: 'alex@example.com', value: '"alex@example.com"' },
      { id: 'why_role', text: null, value: null },
    ],
  });

  const data = mapApplicantInterviewSheetData(item, config);

  assert.equal(data.fullName, 'Fallback Name');
  assert.equal(data.phone, 'Not provided');
  assert.equal(data.email, 'alex@example.com');
  assert.equal(data.role, null);
  assert.equal(data.previousAnswers[0]?.answer, 'Not provided');
  assert.equal(data.previousAnswers[1]?.answer, 'Not provided');
});

test('fetchApplicantInterviewItem surfaces monday GraphQL failures', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        errors: [{ message: 'Board not found' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    await assert.rejects(() => fetchApplicantInterviewItem('123', config), /Board not found/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchApplicantInterviewItem rejects missing items and board mismatches', async () => {
  const originalFetch = globalThis.fetch;
  let step = 0;

  globalThis.fetch = async () => {
    step += 1;

    if (step === 1) {
      return new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        data: {
          items: [buildItem({ board: { id: 'board-2' } })],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    await assert.rejects(() => fetchApplicantInterviewItem('123', config), ApplicantInterviewItemNotFoundError);
    await assert.rejects(() => fetchApplicantInterviewItem('123', config), ApplicantInterviewBoardMismatchError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildApplicantInterviewPdf returns a non-empty branded PDF buffer', async () => {
  const logoBytes = await readFile(new URL('../../../apps/verify-ui/src/assets/logo2.png', import.meta.url));
  const pdf = await buildApplicantInterviewPdf(mapApplicantInterviewSheetData(buildItem(), config), { logoBytes });

  assert.equal(pdf.subarray(0, 5).toString('utf8'), '%PDF-');
  assert.ok(pdf.length > 2000);
});
