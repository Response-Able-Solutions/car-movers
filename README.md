# car-movers

Monorepo for the driver verification UI and API.

## Apps

- `apps/verify-ui`: Vite React frontend
- `apps/api`: Vercel serverless API for monday.com-backed verification

## Packages

- `packages/shared`: shared verification request/response types

## Local setup

1. Run `yarn` from the repo root.
2. Add `apps/api/.env.local` with monday.com credentials and board config.
3. Add `apps/verify-ui/.env.local` with:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## Local development

Run the API:

```bash
yarn dev:api
```

Run the UI in another terminal:

```bash
yarn dev:ui
```

The local API uses `vercel dev`, so the verification endpoint is available at:

```bash
http://localhost:3000/api/verify-driver
```

Additional iDenfy endpoints:

```bash
http://localhost:3000/api/create-idenfy-session
http://localhost:3000/api/idenfy-callback
http://localhost:3000/api/applicant-interview-pdf?itemId=12345
```

The Vite UI will use `VITE_API_BASE_URL` to call that endpoint.

## API env vars

Create `apps/api/.env.local` with:

```bash
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_BOARD_ID=5092630429
MONDAY_ID_COLUMN_ID=pulse_id_mm0w20xh
MONDAY_FIRST_NAME_COLUMN_ID=text_mm0kw9zb
MONDAY_SURNAME_COLUMN_ID=text_mkzd3fzs
MONDAY_STATUS_COLUMN_ID=color_mkzh9qgh
MONDAY_PHOTO_COLUMN_ID=file_mkzdwf9r
MONDAY_ITEM_LIMIT=100
INTERNAL_API_KEY=your_internal_api_key
IDENFY_API_KEY=your_idenfy_api_key
IDENFY_API_SECRET=your_idenfy_api_secret
IDENFY_CALLBACK_SIGNING_KEY=your_idenfy_callback_signing_key
IDENFY_CALLBACK_URL=https://your-api-host/api/idenfy-callback
APPLICANT_INTERVIEW_BOARD_ID=your_applicant_board_id
APPLICANT_INTERVIEW_FIRST_NAME_COLUMN_ID=text_first_name
APPLICANT_INTERVIEW_LAST_NAME_COLUMN_ID=text_last_name
APPLICANT_INTERVIEW_PHONE_COLUMN_ID=phone_phone
APPLICANT_INTERVIEW_EMAIL_COLUMN_ID=email_email
APPLICANT_INTERVIEW_ROLE_COLUMN_ID=text_role
APPLICANT_INTERVIEW_STATUS_COLUMN_ID=color_status
APPLICANT_INTERVIEW_NOTES_COLUMN_ID=long_text_notes
APPLICANT_INTERVIEW_PREVIOUS_ANSWERS_JSON=[{"label":"Why do you want this role?","columnId":"long_text_why_role"},{"label":"When can you start?","columnId":"text_start_date"}]
```

Notes:

- `IDENFY_CALLBACK_URL` is optional. If omitted, the create-session endpoint derives the callback URL from the incoming request host.
- `INTERNAL_API_KEY` protects `POST /api/create-idenfy-session` and `GET /api/applicant-interview-pdf` via the `x-api-key` header.
- `APPLICANT_INTERVIEW_PREVIOUS_ANSWERS_JSON` is optional, but when set it must be a JSON array of `{ "label": "...", "columnId": "..." }` objects.
- The applicant interview PDF endpoint reads from a separate configured monday board and returns a branded `application/pdf` document for one item ID.
- The callback flow updates monday status column `MONDAY_STATUS_COLUMN_ID` with `ID Verify Success` for final approved outcomes and `ID Verify Review` for final suspected outcomes.

## Shared tests

Run the extracted integration module tests with:

```bash
yarn test:shared
```

## Deployments

- Deploy `apps/verify-ui` as the UI project.
- Deploy `apps/api` as the API project.
