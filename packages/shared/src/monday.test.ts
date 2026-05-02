import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchMondayDbsItem,
  MondayDbsItemMissingFieldError,
  updateMondayDbsItem,
  updateMondayStatus,
  type MondayDbsBoardConfig,
} from './monday.ts';

const dbsConfig: MondayDbsBoardConfig = {
  token: 'monday-token',
  boardId: 'board-1',
  columns: {
    applicantName: 'text_name',
    applicantEmail: 'email_email',
    linkedDriverItem: 'connect_driver',
    status: 'color_status',
    trustIdContainerId: 'text_container',
    trustIdGuestId: 'text_guest',
    inviteCreatedAt: 'date_invite',
    dbsReference: 'text_dbs_ref',
    errorDetails: 'long_text_error',
    processingTimestamp: 'date_processed',
  },
};

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

test('fetchMondayDbsItem reads and normalizes configured DBS columns', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;

    return new Response(
      JSON.stringify({
        data: {
          items: [
            {
              id: '12345',
              name: 'DBS Check',
              board: { id: 'board-1' },
              column_values: [
                { id: 'text_name', text: ' Driver Name ', value: null },
                { id: 'email_email', text: 'driver@example.com', value: null },
                {
                  id: 'connect_driver',
                  text: '',
                  value: JSON.stringify({ linkedPulseIds: [{ linkedPulseId: 98765 }] }),
                },
                { id: 'color_status', text: 'Invite sent', value: null },
                { id: 'text_container', text: 'container-123', value: null },
                { id: 'text_guest', text: 'guest-123', value: null },
                { id: 'date_invite', text: '2026-05-02T10:00:00.000Z', value: null },
                { id: 'text_dbs_ref', text: 'dbs-ref-123', value: null },
                { id: 'long_text_error', text: '', value: null },
                { id: 'date_processed', text: '2026-05-02T10:05:00.000Z', value: null },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const item = await fetchMondayDbsItem('12345', dbsConfig);
    const payload = JSON.parse(String(capturedInit?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };

    assert.match(payload.query, /query DbsItem/);
    assert.match(payload.query, /"text_name"/);
    assert.match(payload.query, /"email_email"/);
    assert.deepEqual(payload.variables, {
      itemIds: ['12345'],
    });
    assert.deepEqual(item, {
      itemId: '12345',
      applicantName: 'Driver Name',
      applicantEmail: 'driver@example.com',
      linkedDriverItemId: '98765',
      status: 'Invite sent',
      trustIdContainerId: 'container-123',
      trustIdGuestId: 'guest-123',
      inviteCreatedAt: '2026-05-02T10:00:00.000Z',
      dbsReference: 'dbs-ref-123',
      errorDetails: null,
      processingTimestamp: '2026-05-02T10:05:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchMondayDbsItem rejects missing required applicant fields', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          items: [
            {
              id: '12345',
              name: 'DBS Check',
              board: { id: 'board-1' },
              column_values: [
                { id: 'text_name', text: '', value: null },
                { id: 'email_email', text: 'driver@example.com', value: null },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    await assert.rejects(
      () => fetchMondayDbsItem('12345', dbsConfig),
      (error: unknown) =>
        error instanceof MondayDbsItemMissingFieldError &&
        error.itemId === '12345' &&
        error.fieldName === 'applicant name',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updateMondayDbsItem sends expected column value payload', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;

    return new Response(
      JSON.stringify({
        data: {
          change_multiple_column_values: {
            id: '12345',
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    await updateMondayDbsItem(
      '12345',
      {
        status: 'Invite sent',
        trustIdContainerId: 'container-123',
        trustIdGuestId: 'guest-123',
        inviteCreatedAt: '2026-05-02T10:00:00.000Z',
        dbsReference: 'dbs-ref-123',
        errorDetails: null,
        processingTimestamp: '2026-05-02T10:05:00.000Z',
      },
      dbsConfig,
    );

    const payload = JSON.parse(String(capturedInit?.body)) as {
      query: string;
      variables: Record<string, string>;
    };
    const columnValues = JSON.parse(payload.variables.columnValues) as Record<string, string | null>;

    assert.match(payload.query, /change_multiple_column_values/);
    assert.deepEqual(payload.variables, {
      boardId: 'board-1',
      itemId: '12345',
      columnValues: payload.variables.columnValues,
    });
    assert.deepEqual(columnValues, {
      color_status: 'Invite sent',
      text_container: 'container-123',
      text_guest: 'guest-123',
      date_invite: '2026-05-02T10:00:00.000Z',
      text_dbs_ref: 'dbs-ref-123',
      long_text_error: null,
      date_processed: '2026-05-02T10:05:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
