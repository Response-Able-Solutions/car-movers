import test from 'node:test';
import assert from 'node:assert/strict';

import { updateMondayStatus } from './monday.ts';

test('updateMondayStatus sends the expected monday mutation for the configured status column', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;

    return new Response(
      JSON.stringify({
        data: {
          change_simple_column_value: {
            id: 'item-1',
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    await updateMondayStatus('12345', 'ID Verify Success', {
      token: 'monday-token',
      boardId: 'board-1',
      statusColumnId: 'color_mkzh9qgh',
    });

    const payload = JSON.parse(String(capturedInit?.body)) as {
      query: string;
      variables: Record<string, string>;
    };

    assert.match(payload.query, /change_simple_column_value/);
    assert.deepEqual(payload.variables, {
      boardId: 'board-1',
      itemId: '12345',
      columnId: 'color_mkzh9qgh',
      value: 'ID Verify Success',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updateMondayStatus surfaces monday GraphQL failures', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        errors: [{ message: 'Column not found' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    await assert.rejects(
      () =>
        updateMondayStatus('12345', 'ID Verify Review', {
          token: 'monday-token',
          boardId: 'board-1',
          statusColumnId: 'color_mkzh9qgh',
        }),
      /Column not found/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
