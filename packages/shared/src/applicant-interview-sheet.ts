import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { mondayRequest } from './monday.ts';

export type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
};

export type MondayItem = {
  id: string;
  name: string;
  board?: {
    id: string;
  } | null;
  column_values: MondayColumnValue[];
};

export type ApplicantInterviewAnswerFieldConfig = {
  label: string;
  columnId: string;
};

export type ApplicantInterviewSheetConfig = {
  token: string;
  boardId: string;
  columns: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    role?: string;
    status?: string;
    notes?: string;
  };
  answerFields: ApplicantInterviewAnswerFieldConfig[];
};

export type ApplicantInterviewAnswer = {
  label: string;
  answer: string;
};

export type ApplicantInterviewSheetData = {
  itemId: string;
  fullName: string;
  phone: string;
  email: string;
  role: string | null;
  status: string | null;
  notes: string | null;
  interviewPrompts: string[];
  previousAnswers: ApplicantInterviewAnswer[];
};

type MondayItemQueryResponse = {
  items?: MondayItem[];
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 48,
  marginBottom: 48,
};

const FONT = {
  title: 20,
  section: 13,
  body: 10.5,
  small: 9,
  lineGap: 3,
};

export const DEFAULT_INTERVIEW_PROMPTS = [
  'Confirm the applicant\'s current background and recent work history.',
  'Confirm interest in the role and why they want to work with Response Able Solutions.',
  'Confirm availability, preferred working pattern, and any notice period.',
  'Confirm relevant driving, transport, or customer-facing experience.',
  'Capture any follow-up points from the application answers below.',
];

export class ApplicantInterviewItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Applicant item ${itemId} not found`);
    this.name = 'ApplicantInterviewItemNotFoundError';
  }
}

export class ApplicantInterviewBoardMismatchError extends Error {
  constructor(itemId: string, boardId: string) {
    super(`Applicant item ${itemId} does not belong to configured board ${boardId}`);
    this.name = 'ApplicantInterviewBoardMismatchError';
  }
}

function escapeGraphQlString(value: string) {
  return JSON.stringify(value);
}

function buildColumnSelection(config: ApplicantInterviewSheetConfig) {
  const columnIds = [
    config.columns.firstName,
    config.columns.lastName,
    config.columns.phone,
    config.columns.email,
    config.columns.role,
    config.columns.status,
    config.columns.notes,
    ...config.answerFields.map((field) => field.columnId),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(columnIds)].map((columnId) => escapeGraphQlString(columnId)).join(', ');
}

function readColumn(item: MondayItem, columnId: string | undefined) {
  if (!columnId) {
    return null;
  }

  return item.column_values.find((column) => column.id === columnId) ?? null;
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function displayValue(value: string | null | undefined) {
  return normalizeText(value) ?? 'Not provided';
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${currentLine} ${word}`;

    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  lines.push(currentLine);
  return lines;
}

function buildHeaderValues(data: ApplicantInterviewSheetData) {
  return [
    ['Applicant', data.fullName],
    ['Phone', data.phone],
    ['Email', data.email],
    ['Role', displayValue(data.role)],
    ['Status', displayValue(data.status)],
    ['Monday Item', data.itemId],
  ] as const;
}

function drawWrappedBlock(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize = FONT.body,
  color = rgb(0.15, 0.2, 0.28),
) {
  const lines = wrapText(text, font, fontSize, maxWidth);
  const lineHeight = fontSize + FONT.lineGap;
  let currentY = y;

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: currentY,
      size: fontSize,
      font,
      color,
    });
    currentY -= lineHeight;
  }

  return currentY;
}

function createPage(doc: PDFDocument, fonts: { body: PDFFont; bold: PDFFont }) {
  const page = doc.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({
    x: 0,
    y: PAGE.height - 112,
    width: PAGE.width,
    height: 112,
    color: rgb(0.92, 0.97, 1),
  });
  page.drawLine({
    start: { x: PAGE.marginX, y: PAGE.height - 118 },
    end: { x: PAGE.width - PAGE.marginX, y: PAGE.height - 118 },
    thickness: 1,
    color: rgb(0.16, 0.45, 0.77),
  });
  page.drawText('Applicant Interview Sheet', {
    x: PAGE.marginX,
    y: PAGE.height - 74,
    size: FONT.title,
    font: fonts.bold,
    color: rgb(0.06, 0.2, 0.37),
  });
  page.drawText('Internal use only', {
    x: PAGE.marginX,
    y: PAGE.height - 94,
    size: FONT.small,
    font: fonts.body,
    color: rgb(0.28, 0.39, 0.52),
  });

  return {
    page,
    y: PAGE.height - 142,
  };
}

async function drawLogo(
  doc: PDFDocument,
  page: PDFPage,
  logoBytes: Uint8Array | null | undefined,
  maxWidth = 178,
) {
  if (!logoBytes) {
    return;
  }

  try {
    const image = await doc.embedPng(logoBytes);
    const scale = maxWidth / image.width;

    page.drawImage(image, {
      x: PAGE.width - PAGE.marginX - image.width * scale,
      y: PAGE.height - 94,
      width: image.width * scale,
      height: image.height * scale,
    });
  } catch {
    // Branding is intentionally non-fatal in local dev and test environments.
  }
}

function ensureSpace(
  doc: PDFDocument,
  state: { page: PDFPage; y: number },
  fonts: { body: PDFFont; bold: PDFFont },
  requiredHeight: number,
) {
  if (state.y - requiredHeight >= PAGE.marginBottom) {
    return state;
  }

  return createPage(doc, fonts);
}

function drawSectionTitle(
  doc: PDFDocument,
  state: { page: PDFPage; y: number },
  fonts: { body: PDFFont; bold: PDFFont },
  title: string,
) {
  const nextState = ensureSpace(doc, state, fonts, 28);
  nextState.page.drawText(title, {
    x: PAGE.marginX,
    y: nextState.y,
    size: FONT.section,
    font: fonts.bold,
    color: rgb(0.09, 0.26, 0.46),
  });

  return {
    page: nextState.page,
    y: nextState.y - 18,
  };
}

export async function fetchApplicantInterviewItem(
  itemId: string,
  config: ApplicantInterviewSheetConfig,
) {
  const data = await mondayRequest<MondayItemQueryResponse>(
    `
      query ApplicantInterviewItem($itemIds: [ID!]!) {
        items(ids: $itemIds) {
          id
          name
          board {
            id
          }
          column_values(ids: [${buildColumnSelection(config)}]) {
            id
            text
            value
          }
        }
      }
    `,
    {
      itemIds: [itemId],
    },
    config.token,
  );

  const item = data.items?.[0] ?? null;

  if (!item) {
    throw new ApplicantInterviewItemNotFoundError(itemId);
  }

  if (item.board?.id && item.board.id !== config.boardId) {
    throw new ApplicantInterviewBoardMismatchError(itemId, config.boardId);
  }

  return item;
}

export function mapApplicantInterviewSheetData(
  item: MondayItem,
  config: ApplicantInterviewSheetConfig,
): ApplicantInterviewSheetData {
  const firstName = normalizeText(readColumn(item, config.columns.firstName)?.text);
  const lastName = normalizeText(readColumn(item, config.columns.lastName)?.text);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || item.name.trim() || 'Unnamed applicant';

  return {
    itemId: item.id,
    fullName,
    phone: displayValue(readColumn(item, config.columns.phone)?.text),
    email: displayValue(readColumn(item, config.columns.email)?.text),
    role: normalizeText(readColumn(item, config.columns.role)?.text),
    status: normalizeText(readColumn(item, config.columns.status)?.text),
    notes: normalizeText(readColumn(item, config.columns.notes)?.text),
    interviewPrompts: DEFAULT_INTERVIEW_PROMPTS,
    previousAnswers: config.answerFields.map((field) => ({
      label: field.label,
      answer: displayValue(readColumn(item, field.columnId)?.text),
    })),
  };
}

export async function getApplicantInterviewSheetData(
  itemId: string,
  config: ApplicantInterviewSheetConfig,
) {
  const item = await fetchApplicantInterviewItem(itemId, config);
  return mapApplicantInterviewSheetData(item, config);
}

export async function buildApplicantInterviewPdf(
  data: ApplicantInterviewSheetData,
  options?: {
    logoBytes?: Uint8Array | null;
  },
) {
  const doc = await PDFDocument.create();
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { body: bodyFont, bold: boldFont };

  let state = createPage(doc, fonts);
  await drawLogo(doc, state.page, options?.logoBytes);

  const columnGap = 24;
  const columnWidth = (PAGE.width - PAGE.marginX * 2 - columnGap) / 2;
  const leftX = PAGE.marginX;
  const rightX = PAGE.marginX + columnWidth + columnGap;
  const headerEntries = buildHeaderValues(data);

  let leftY = state.y;
  let rightY = state.y;

  for (const [label, value] of headerEntries.slice(0, 3)) {
    state.page.drawText(label, {
      x: leftX,
      y: leftY,
      size: FONT.small,
      font: boldFont,
      color: rgb(0.28, 0.39, 0.52),
    });
    leftY = drawWrappedBlock(state.page, bodyFont, value, leftX, leftY - 14, columnWidth, FONT.body) - 8;
  }

  for (const [label, value] of headerEntries.slice(3)) {
    state.page.drawText(label, {
      x: rightX,
      y: rightY,
      size: FONT.small,
      font: boldFont,
      color: rgb(0.28, 0.39, 0.52),
    });
    rightY = drawWrappedBlock(state.page, bodyFont, value, rightX, rightY - 14, columnWidth, FONT.body) - 8;
  }

  state.y = Math.min(leftY, rightY) - 4;

  state = drawSectionTitle(doc, state, fonts, 'Interview prompts');
  for (const prompt of data.interviewPrompts) {
    state = ensureSpace(doc, state, fonts, 36);
    state.page.drawText('\u2022', {
      x: PAGE.marginX,
      y: state.y,
      size: FONT.body,
      font: boldFont,
      color: rgb(0.09, 0.26, 0.46),
    });
    state.y =
      drawWrappedBlock(
        state.page,
        bodyFont,
        prompt,
        PAGE.marginX + 14,
        state.y,
        PAGE.width - PAGE.marginX * 2 - 14,
      ) - 7;
  }

  state = drawSectionTitle(doc, state, fonts, 'Existing application answers');
  for (const answer of data.previousAnswers) {
    state = ensureSpace(doc, state, fonts, 46);
    state.page.drawText(answer.label, {
      x: PAGE.marginX,
      y: state.y,
      size: FONT.small,
      font: boldFont,
      color: rgb(0.28, 0.39, 0.52),
    });
    state.y =
      drawWrappedBlock(
        state.page,
        bodyFont,
        answer.answer,
        PAGE.marginX,
        state.y - 14,
        PAGE.width - PAGE.marginX * 2,
      ) - 9;
  }

  if (data.notes) {
    state = drawSectionTitle(doc, state, fonts, 'Application notes');
    state = ensureSpace(doc, state, fonts, 60);
    state.y =
      drawWrappedBlock(
        state.page,
        bodyFont,
        data.notes,
        PAGE.marginX,
        state.y,
        PAGE.width - PAGE.marginX * 2,
      ) - 6;
  }

  return Buffer.from(await doc.save());
}
