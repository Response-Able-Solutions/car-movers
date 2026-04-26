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
    shiftPattern?: string;
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
  shiftPattern: string | null;
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
  marginX: 42,
  marginBottom: 42,
};

const FONT = {
  title: 26,
  section: 14,
  body: 10.5,
  small: 8.5,
  lineGap: 3,
};

const COLOR = {
  ink: rgb(0.043, 0.165, 0.29),
  primary: rgb(0.22, 0.68, 0.97),
  primaryDark: rgb(0.118, 0.49, 0.84),
  sky: rgb(0.752, 0.914, 0.995),
  mist: rgb(0.932, 0.979, 1),
  surface: rgb(1, 1, 1),
  sheet: rgb(0.984, 0.995, 1),
  line: rgb(0.737, 0.882, 0.98),
  muted: rgb(0.365, 0.482, 0.588),
};

const LAYOUT = {
  coverTop: 186,
  continuationTop: 86,
  sectionGap: 24,
  cardGap: 12,
  cardRowGap: 12,
  sectionBlockGap: 16,
  answerGap: 18,
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
    config.columns.shiftPattern,
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

function getTextHeight(lineCount: number, fontSize: number) {
  return lineCount * (fontSize + FONT.lineGap);
}

function measureWrappedTextHeight(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  return getTextHeight(wrapText(text, font, fontSize, maxWidth).length, fontSize);
}

function buildHeaderValues(data: ApplicantInterviewSheetData) {
  return [
    ['Applicant', data.fullName],
    ['Phone', data.phone],
    ['Email', data.email],
    ['Shift pattern', displayValue(data.shiftPattern)],
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
  color = COLOR.ink,
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

function drawPill(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
) {
  const radius = height / 2;
  page.drawRectangle({
    x: x + radius,
    y,
    width: Math.max(width - height, 0),
    height,
    color,
  });
  page.drawEllipse({
    x: x + radius,
    y: y + radius,
    xScale: radius,
    yScale: radius,
    color,
  });
  page.drawEllipse({
    x: x + width - radius,
    y: y + radius,
    xScale: radius,
    yScale: radius,
    color,
  });
}

function createCoverPage(doc: PDFDocument, fonts: { body: PDFFont; bold: PDFFont }) {
  const page = doc.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    color: COLOR.sheet,
  });
  page.drawEllipse({
    x: PAGE.width - 112,
    y: PAGE.height - 96,
    xScale: 108,
    yScale: 108,
    color: COLOR.sky,
  });
  page.drawEllipse({
    x: PAGE.width - 36,
    y: PAGE.height - 32,
    xScale: 76,
    yScale: 76,
    color: COLOR.mist,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE.height - LAYOUT.coverTop,
    width: PAGE.width,
    height: LAYOUT.coverTop,
    color: COLOR.mist,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE.height - 8,
    width: PAGE.width,
    height: 8,
    color: COLOR.primary,
  });
  page.drawRectangle({
    x: PAGE.marginX,
    y: PAGE.height - 174,
    width: PAGE.width - PAGE.marginX * 2,
    height: 104,
    color: COLOR.surface,
    borderColor: COLOR.line,
    borderWidth: 1,
  });
  drawPill(page, PAGE.marginX, PAGE.height - 68, 134, 20, COLOR.primary);
  page.drawText('INTERNAL INTERVIEW', {
    x: PAGE.marginX + 16,
    y: PAGE.height - 61,
    size: 7.5,
    font: fonts.bold,
    color: COLOR.surface,
  });
  page.drawText('Applicant Interview Sheet', {
    x: PAGE.marginX,
    y: PAGE.height - 116,
    size: FONT.title,
    font: fonts.bold,
    color: COLOR.ink,
  });
  page.drawText('For internal use only', {
    x: PAGE.marginX + 10,
    y: PAGE.height - 152,
    size: FONT.small,
    font: fonts.bold,
    color: COLOR.primaryDark,
  });

  return {
    page,
    y: PAGE.height - 196,
  };
}

function createContinuationPage(doc: PDFDocument, fonts: { body: PDFFont; bold: PDFFont }) {
  const page = doc.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    color: COLOR.sheet,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE.height - LAYOUT.continuationTop,
    width: PAGE.width,
    height: LAYOUT.continuationTop,
    color: COLOR.mist,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE.height - 6,
    width: PAGE.width,
    height: 6,
    color: COLOR.primary,
  });
  page.drawText('Applicant Interview Sheet', {
    x: PAGE.marginX,
    y: PAGE.height - 40,
    size: 15,
    font: fonts.bold,
    color: COLOR.ink,
  });
  page.drawText('Continued', {
    x: PAGE.width - PAGE.marginX - 46,
    y: PAGE.height - 40,
    size: FONT.small,
    font: fonts.bold,
    color: COLOR.primaryDark,
  });

  return {
    page,
    y: PAGE.height - 104,
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
      y: PAGE.height - 144,
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

  return createContinuationPage(doc, fonts);
}

function drawSectionTitle(
  doc: PDFDocument,
  state: { page: PDFPage; y: number },
  fonts: { body: PDFFont; bold: PDFFont },
  title: string,
) {
  const nextState = ensureSpace(doc, state, fonts, 34);
  nextState.page.drawText(title, {
    x: PAGE.marginX,
    y: nextState.y,
    size: FONT.section,
    font: fonts.bold,
    color: COLOR.ink,
  });
  nextState.page.drawRectangle({
    x: PAGE.marginX,
    y: nextState.y - 8,
    width: PAGE.width - PAGE.marginX * 2,
    height: 1,
    color: COLOR.line,
  });
  nextState.page.drawRectangle({
    x: PAGE.marginX,
    y: nextState.y - 8,
    width: 72,
    height: 2,
    color: COLOR.primary,
  });

  return {
    page: nextState.page,
    y: nextState.y - LAYOUT.sectionGap,
  };
}

function drawInfoCard(
  page: PDFPage,
  fonts: { body: PDFFont; bold: PDFFont },
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: COLOR.surface,
    borderColor: COLOR.line,
    borderWidth: 1,
  });
  page.drawRectangle({
    x,
    y: y - 4,
    width,
    height: 4,
    color: COLOR.primary,
  });
  drawPill(page, x + 12, y - 25, 84, 16, COLOR.mist);
  page.drawText(label.toUpperCase(), {
    x: x + 22,
    y: y - 19,
    size: 7.2,
    font: fonts.bold,
    color: COLOR.primaryDark,
  });
  drawWrappedBlock(page, fonts.body, value, x + 16, y - 44, width - 32, FONT.body, COLOR.ink);
}

function measureInfoCardHeight(font: PDFFont, value: string, width: number) {
  const textHeight = measureWrappedTextHeight(value, font, FONT.body, width - 32);
  return Math.max(68, 48 + textHeight);
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
    shiftPattern: normalizeText(readColumn(item, config.columns.shiftPattern)?.text),
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

  let state = createCoverPage(doc, fonts);
  await drawLogo(doc, state.page, options?.logoBytes);
  const headerEntries = buildHeaderValues(data);
  const cardWidth = (PAGE.width - PAGE.marginX * 2 - LAYOUT.cardGap) / 2;

  for (let index = 0; index < headerEntries.length; index += 2) {
    const rowEntries = headerEntries.slice(index, index + 2);
    const rowHeight = Math.max(
      ...rowEntries.map(([, value]) => measureInfoCardHeight(bodyFont, value, cardWidth)),
    );

    rowEntries.forEach(([label, value], column) => {
      const cardX = PAGE.marginX + column * (cardWidth + LAYOUT.cardGap);
      drawInfoCard(state.page, fonts, label, value, cardX, state.y, cardWidth, rowHeight);
    });

    state.y -= rowHeight + LAYOUT.cardRowGap;
  }

  state.y -= LAYOUT.sectionBlockGap;

  state = drawSectionTitle(doc, state, fonts, 'Existing application answers');
  for (const answer of data.previousAnswers) {
    const answerWidth = PAGE.width - PAGE.marginX * 2 - 24;
    const answerHeight = measureWrappedTextHeight(answer.answer, bodyFont, FONT.body, answerWidth);
    const blockHeight = 20 + answerHeight;
    state = ensureSpace(doc, state, fonts, blockHeight + 4);
    state.page.drawText(answer.label, {
      x: PAGE.marginX,
      y: state.y - 2,
      size: FONT.small,
      font: boldFont,
      color: COLOR.primaryDark,
    });
    state.y =
      drawWrappedBlock(
        state.page,
        bodyFont,
        answer.answer,
        PAGE.marginX,
        state.y - 20,
        PAGE.width - PAGE.marginX * 2,
      ) - LAYOUT.answerGap;
  }

  if (data.notes) {
    state = drawSectionTitle(doc, state, fonts, 'Application notes');
    const notesHeight = measureWrappedTextHeight(
      data.notes,
      bodyFont,
      FONT.body,
      PAGE.width - PAGE.marginX * 2 - 24,
    );
    const boxHeight = Math.max(54, 24 + notesHeight);
    state = ensureSpace(doc, state, fonts, boxHeight + 4);
    state.page.drawRectangle({
      x: PAGE.marginX,
      y: state.y - boxHeight,
      width: PAGE.width - PAGE.marginX * 2,
      height: boxHeight,
      color: COLOR.surface,
      borderColor: COLOR.line,
      borderWidth: 1,
    });
    state.page.drawRectangle({
      x: PAGE.marginX,
      y: state.y - 8,
      width: PAGE.width - PAGE.marginX * 2,
      height: 8,
      color: COLOR.mist,
    });
    state.y =
      drawWrappedBlock(
        state.page,
        bodyFont,
        data.notes,
        PAGE.marginX + 12,
        state.y - 16,
        PAGE.width - PAGE.marginX * 2 - 24,
      ) - 12;
  }

  return Buffer.from(await doc.save());
}
