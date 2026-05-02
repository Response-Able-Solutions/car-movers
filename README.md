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
http://localhost:3000/api/create-trustid-dbs-invite
http://localhost:3000/api/trustid-dbs-callback?mondayItemId=12345
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
TRUSTID_BASE_URL=https://sandbox.trustid.co.uk
TRUSTID_API_KEY=your_trustid_api_key
TRUSTID_USERNAME=your_trustid_api_username
TRUSTID_PASSWORD=your_trustid_api_password
TRUSTID_DEVICE_ID=your_stable_device_id
TRUSTID_BRANCH_ID=your_trustid_branch_id
TRUSTID_CALLBACK_BASE_URL=https://your-api-host
TRUSTID_DBS_EMPLOYER_NAME=Car Movers
TRUSTID_DBS_EVIDENCE_CHECKED_BY=your_evidence_checker_name
TRUSTID_DBS_EMPLOYMENT_SECTOR=DRIVERS
TRUSTID_DBS_PURPOSE_OF_CHECK=Employment
TRUSTID_DBS_OTHER=
APPLICANT_INTERVIEW_BOARD_ID=your_applicant_board_id
APPLICANT_INTERVIEW_FIRST_NAME_COLUMN_ID=text_first_name
APPLICANT_INTERVIEW_LAST_NAME_COLUMN_ID=text_last_name
APPLICANT_INTERVIEW_PHONE_COLUMN_ID=phone_phone
APPLICANT_INTERVIEW_EMAIL_COLUMN_ID=email_email
APPLICANT_INTERVIEW_ROLE_COLUMN_ID=text_role
APPLICANT_INTERVIEW_STATUS_COLUMN_ID=color_status
APPLICANT_INTERVIEW_NOTES_COLUMN_ID=long_text_notes
DBS_BOARD_ID=your_dbs_board_id
DBS_APPLICANT_NAME_COLUMN_ID=text_applicant_name
DBS_APPLICANT_EMAIL_COLUMN_ID=email_applicant_email
DBS_LINKED_DRIVER_ITEM_COLUMN_ID=connect_driver
DBS_STATUS_COLUMN_ID=color_status
DBS_TRUSTID_CONTAINER_ID_COLUMN_ID=text_trustid_container
DBS_TRUSTID_GUEST_ID_COLUMN_ID=text_trustid_guest
DBS_INVITE_CREATED_AT_COLUMN_ID=date_invite_created
DBS_REFERENCE_COLUMN_ID=text_dbs_reference
DBS_ERROR_DETAILS_COLUMN_ID=long_text_error_details
DBS_PROCESSING_TIMESTAMP_COLUMN_ID=date_processing_timestamp
```

Notes:

- `IDENFY_CALLBACK_URL` is optional. If omitted, the create-session endpoint derives the callback URL from the incoming request host.
- `INTERNAL_API_KEY` protects `POST /api/create-idenfy-session` and `GET /api/applicant-interview-pdf` via the `x-api-key` header.
- `POST /api/create-trustid-dbs-invite` is protected by `INTERNAL_API_KEY` and expects `{ "mondayItemId": "12345" }`.
- `POST /api/trustid-dbs-callback?mondayItemId=12345` receives TrustID final result notifications, retrieves TrustID result content, initiates the Basic DBS check, and updates the DBS board.
- The applicant interview PDF endpoint includes the fixed shift-pattern column `dropdown_mm09fzwe` for applicant availability.
- The applicant interview PDF endpoint has four fixed application-answer mappings checked into code for the current interview questions.
- The applicant interview PDF endpoint reads from a separate configured monday board and returns a branded `application/pdf` document for one item ID.
- The callback flow updates monday status column `MONDAY_STATUS_COLUMN_ID` with `ID Verify Success` for final approved outcomes and `ID Verify Review` for final suspected outcomes.
- The DBS board must store applicant name and applicant email directly because these are required to create a TrustID guest link. The linked driver item column is used for traceability.
- The DBS board adapter reads and writes TrustID container/guest IDs, invite creation time, DBS reference, error details, status, and processing timestamp through the configured DBS column IDs.
- `TRUSTID_CALLBACK_BASE_URL` is optional for local testing. If omitted, the TrustID DBS invite endpoint derives the callback base URL from the incoming request host.
- The TrustID DBS invite workflow blocks duplicate invites while an existing TrustID guest/container ID is active. Guest links are treated as active for 14 days after invite creation unless the DBS item has a final unsuccessful status.
- The TrustID DBS callback workflow submits Basic DBS only. The required evidence, consent, original document, address, and date-of-birth confirmations are sent as accepted for v1.
- TrustID DBS callback processing is idempotent for known states. Already submitted items and in-progress items return HTTP 200 without submitting another Basic DBS check; error states remain retryable.

## TrustID Basic DBS setup

The TrustID DBS integration is Basic DBS only. Standard and Enhanced DBS checks are not supported by this workflow.

### Runtime flow

1. A monday.com automation creates a DBS board item after the relevant main-board driver status change.
2. The DBS board item triggers `POST /api/create-trustid-dbs-invite` with `{ "mondayItemId": "12345" }` and the `x-api-key` header.
3. The API reads the DBS board item, creates a TrustID guest link, and lets TrustID send the applicant invitation email.
4. TrustID calls `POST /api/trustid-dbs-callback?mondayItemId=12345` when the final result notification is available.
5. The API retrieves TrustID result content, initiates the Basic DBS check, and writes the DBS reference or error details back to the DBS board.

### TrustID configuration

Required TrustID environment variables:

```bash
TRUSTID_BASE_URL=https://sandbox.trustid.co.uk
TRUSTID_API_KEY=your_trustid_api_key
TRUSTID_USERNAME=your_trustid_api_username
TRUSTID_PASSWORD=your_trustid_api_password
TRUSTID_DEVICE_ID=your_stable_device_id
TRUSTID_BRANCH_ID=your_trustid_branch_id
TRUSTID_CALLBACK_BASE_URL=https://your-api-host
TRUSTID_DBS_EMPLOYER_NAME=Car Movers
TRUSTID_DBS_EVIDENCE_CHECKED_BY=your_evidence_checker_name
TRUSTID_DBS_EMPLOYMENT_SECTOR=DRIVERS
TRUSTID_DBS_PURPOSE_OF_CHECK=Employment
TRUSTID_DBS_OTHER=
```

`TRUSTID_CALLBACK_BASE_URL` is used to build the dynamic callback URL passed to TrustID when creating the guest link. If it is omitted, the invite endpoint derives the callback base URL from the incoming request host.

Sandbox and production are separate TrustID environments. Sandbox credentials and base URL must not be reused in production. The sandbox credentials shared during planning should be treated as exposed and reset/rotated before deployment or wider sharing.

### Webhook mode

This integration uses TrustID dynamic callback URLs for v1. The callback URL is passed in the guest-link request and includes the DBS monday item ID for correlation.

Dynamic callbacks only provide the final `ResultNotification` event. Intermediate TrustID events such as `ContainerSubmitted` and `ContainerSentToReview` are intentionally out of scope for v1. Do not configure this integration to depend on both static TrustID webhook URLs and dynamic callback URLs at the same time.

### DBS monday.com board

The DBS board must contain the applicant details required to create a TrustID invite. The API does not fetch name/email from the main driver board during v1 kickoff.

Required DBS board columns:

- Applicant name
- Applicant email
- Linked driver/main-board item
- DBS status
- TrustID container ID
- TrustID guest ID
- Invite created timestamp
- DBS reference
- Error/details
- Processing timestamp

Required DBS board environment variables:

```bash
DBS_BOARD_ID=your_dbs_board_id
DBS_APPLICANT_NAME_COLUMN_ID=text_applicant_name
DBS_APPLICANT_EMAIL_COLUMN_ID=email_applicant_email
DBS_LINKED_DRIVER_ITEM_COLUMN_ID=connect_driver
DBS_STATUS_COLUMN_ID=color_status
DBS_TRUSTID_CONTAINER_ID_COLUMN_ID=text_trustid_container
DBS_TRUSTID_GUEST_ID_COLUMN_ID=text_trustid_guest
DBS_INVITE_CREATED_AT_COLUMN_ID=date_invite_created
DBS_REFERENCE_COLUMN_ID=text_dbs_reference
DBS_ERROR_DETAILS_COLUMN_ID=long_text_error_details
DBS_PROCESSING_TIMESTAMP_COLUMN_ID=date_processing_timestamp
```

The workflow writes these status labels:

- `TrustID Invite Sent`
- `TrustID Invite Active`
- `TrustID Invite Error`
- `TrustID Result Received`
- `TrustID DBS Submitted`
- `TrustID DBS Error`

### Duplicate and retry behavior

TrustID guest links are treated as active for 14 days after invite creation. The invite endpoint will not create another TrustID guest link while an existing TrustID guest/container ID is active, unless the previous check has a final unsuccessful status.

Callback processing is idempotent for known states:

- `TrustID DBS Submitted` with a DBS reference returns success without submitting another Basic DBS check.
- `TrustID Result Received` returns success without starting parallel callback work.
- `TrustID DBS Error` remains retryable.

### Go-live checklist

- Reset or rotate the exposed sandbox password before any shared testing.
- Confirm the TrustID sandbox flow works end to end with the configured DBS board.
- Schedule the TrustID go-live call before the desired production launch date.
- Replace sandbox TrustID credentials and `TRUSTID_BASE_URL` with production values after TrustID issues production access.
- Confirm the deployed `TRUSTID_CALLBACK_BASE_URL` is public, stable, and points at the API deployment.
- Confirm TrustID can reach `POST /api/trustid-dbs-callback?mondayItemId=...` and receives HTTP 200 for accepted callbacks.
- Confirm monday.com automation creates the DBS board item before calling `POST /api/create-trustid-dbs-invite`.
- Confirm the DBS board columns and env vars match production column IDs.
- Confirm Basic DBS-only scope with the operations team before launch.
- Run `yarn test:shared` and `yarn typecheck:api` before deploying.

## Shared tests

Run the extracted integration module tests with:

```bash
yarn test:shared
```

## Deployments

- Deploy `apps/verify-ui` as the UI project.
- Deploy `apps/api` as the API project.
