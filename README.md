# Welcome to CDK TypeScript project

This is a project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Stages (Dev/Prod)

This project now defines Dev and Prod stages via a shared `AutonomoControlStage` wrapper. Each stage
deploys its own stack (`AutonomoControlCdkStack-dev` and `AutonomoControlCdkStack-prod`) and tags
resources with `Stage=dev` or `Stage=prod`. You can override the target account/region per stage via
CDK context.

## Shared S3 artifact bucket (autonomo-control-api)

This app also defines a shared stack (`AutonomoControlSharedStack`) that provisions a single S3
bucket used to store the `autonomo-control-api` Lambda artifact. The bucket name is the same for
both Dev and Prod (it does not include the stage name).

- Bucket name: `autonomo-control-api-artifacts-<account>-<region>`
- Override the shared stack env (only if Dev/Prod differ): `-c shared.account=... -c shared.region=...`
- SSM parameter created: `/autonomo-control/autonomo-control-api/artifact-bucket-name`

The actual deployable stack names include the stage prefix. To see them:

* `npx cdk list`
  * `Dev/AutonomoControlCdkStack-dev`
  * `Prod/AutonomoControlCdkStack-prod`
  * `AutonomoControlSharedStack`

## Lambda API + HTTP API (dev/prod)

Each stage stack now provisions:

- A Java 17 Lambda function (handler: `autonomo.handler.RecordsLambda`) using the artifact stored in the
  shared S3 bucket under `autonomo-control-api/<version>/app.zip`.
- An API Gateway HTTP API (explicit routes, no `$default` route) integrated with the Lambda.

Route note:

- The Lambda handler supports multiple paths internally, but API Gateway HTTP API v2 requires routes to be
  declared up front. If you add a new backend endpoint, also add the corresponding route in
  `lib/autonomo_control_cdk-stack.ts` (otherwise the path will return 404 and browser preflight may fail).
- Balance route: `GET /workspaces/{workspaceId}/balance` is declared explicitly and supports the API
  query parameters handled by the Lambda, such as `year` and `accountId`.
- Business entity routes are declared explicitly:
  - `GET /workspaces/{workspaceId}/business-entities`
  - `POST /workspaces/{workspaceId}/business-entities`
  - `PUT /workspaces/{workspaceId}/business-entities/{entityId}`
  - `POST /workspaces/{workspaceId}/business-entities/{entityId}/archive`
  - `GET /workspaces/{workspaceId}/business-entities/{entityId}/summary`
- Exchange-rate route: `GET /exchange-rates/nbu` is declared explicitly for the backend NBU proxy.
- Current summary routes include `POST /workspaces/{workspaceId}/summaries/months`,
  `POST /workspaces/{workspaceId}/summaries/quarters`,
  `POST /workspaces/{workspaceId}/summaries/iva`, and
  `POST /workspaces/{workspaceId}/summaries/renta`.

You can deploy different Lambda artifact versions to dev and prod (e.g. test newer versions on dev):

- Global default: `API_ARTIFACT_VERSION=2.2.0` or `-c apiArtifactVersion=2.2.0`
- Dev override: `-c devApiArtifactVersion=2.2.0`
- Prod override: `-c prodApiArtifactVersion=2.2.0`
- Alternatively via env files: `API_ARTIFACT_VERSION_DEV=0.0.1` / `API_ARTIFACT_VERSION_PROD=0.0.1`

Lambda environment variables are set per stage:

- `ENV=dev|prod`
- `DDB_TABLE_PREFIX=<tableNamePrefix>-<stage>` (so the Lambda uses the correct DynamoDB tables)
- `ENVELOPE_KMS_KEY_ARN=<kmsKeyArn>` (per-stage KMS CMK used for envelope encryption of sensitive JSON fields)

The Balance, business-entity, business-entity summary, and exchange-rate endpoints use the existing
Lambda integration, DynamoDB table environment variables, and IAM grants for `workspace_records`,
`workspace_settings`, and membership/workspace tables. No extra DynamoDB table, index, environment
variable, or IAM permission is required for these routes. Business-entity invoice filtering for the
MVP is handled by the API after existing year-prefix record queries.

After deployment, see CloudFormation outputs for each stack (API URL, Cognito IDs, etc.).

## Sensitive JSON envelope encryption (dev/prod)

Each stage stack provisions a dedicated KMS CMK (with rotation enabled) for encrypting:

- `workspace_records.payload_json`
- `workspace_settings.settings_json`

The key is output as `SensitiveJsonKmsKeyArn` and passed to the API Lambda via `ENVELOPE_KMS_KEY_ARN`.

## CloudWatch observability (Lambda)

Each stage stack also configures basic CloudWatch observability for the API Lambda:

- **Log retention**: sets the Lambda log group retention to **30 days** to avoid unbounded log storage.
- **Alarms**:
  - `Errors > 0`
  - `Throttles > 0`
  - `Duration p95` above **90% of the Lambda timeout**
- **Service dashboard**: a single CloudWatch dashboard with key Lambda metrics, alarm status, and a Logs Insights query widget.

After deployment, use the stack output `AutonomoControlServiceDashboardName` to find the dashboard in the CloudWatch console.

## Cognito User Pool + Google IdP (dev/prod)

Each stage creates its own Cognito User Pool, User Pool Client, and User Pool Domain. This allows
logging into both dev and prod with the same Google account while keeping completely separate user
pool users (and therefore separate app data per stage).

Google OAuth is optional. The stack will deploy the User Pool + Domain without Google configured so
you can obtain the Cognito domain first (needed to configure the OAuth client in Google Cloud
Console). Google IdP resources are only created when **both** `GoogleClientId` and
`GoogleClientSecretName` are non-empty.

Note: the Cognito **App client secret** you see in the AWS Console is unrelated to the Google OAuth
client secret. This stack creates a *public* User Pool app client (`generateSecret: false`), so the
AWS Console will show an empty “Client secret” for `autonomo-control-*-web` even when Google OAuth is
enabled. The Google client secret is read from Secrets Manager and applied to the **Identity
provider (Google)** configuration instead.

To enable Google OAuth, pass the settings to each stack:

- `GoogleClientId` (OAuth client id)
- `GoogleClientSecretName` (Secrets Manager secret name containing the OAuth client secret as a
  plaintext `SecretString`)
- `OAuthCallbackUrls`, `OAuthLogoutUrls` (comma-separated lists)
- `CorsAllowOrigins` (comma-separated list)

What these URLs/origins mean (usually you set them when you have a web frontend):

- `OAuthCallbackUrls*`: Allowed redirect (callback) URLs after login. This must exactly match the
  redirect URI your app uses to complete the OAuth flow (scheme/host/port/path), e.g.
  `http://localhost:3000/auth/callback`.
- `OAuthLogoutUrls*`: Allowed redirect URLs after logout, e.g. `http://localhost:3000/`.
- `CorsAllowOrigins*`: Allowed *website origins* for browser calls to the HTTP API (CORS). This is
  the origin only (scheme/host/port), not a browser name and not a path, e.g. `http://localhost:3000`
  or `https://dev.example.com`. Multiple entries are comma-separated.

You can provide these either as CloudFormation parameters at deploy time, or via CDK context / env
vars (so they become parameter defaults at synth time).

For convenience, this repo also supports local env files (not committed). The CDK app will load
these automatically when it runs:

- `.env.local` (shared)
- `.env.dev.local` (dev overrides)
- `.env.prod.local` (prod overrides)

Templates you can copy:

- `.env.dev.local.example` → `.env.dev.local`
- `.env.prod.local.example` → `.env.prod.local`

Tip: because both `.env.dev.local` and `.env.prod.local` may be loaded in the same synth process,
prefer stage-suffixed keys (e.g. `GOOGLE_CLIENT_ID_DEV` / `GOOGLE_CLIENT_ID_PROD`) in the stage
files to avoid collisions.

- Global: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_NAME`, `OAUTH_CALLBACK_URLS`, `OAUTH_LOGOUT_URLS`,
  `CORS_ALLOW_ORIGINS`, `API_ARTIFACT_VERSION`
- Dev: `GOOGLE_CLIENT_ID_DEV`, `GOOGLE_CLIENT_SECRET_NAME_DEV`, `OAUTH_CALLBACK_URLS_DEV`,
  `OAUTH_LOGOUT_URLS_DEV`, `CORS_ALLOW_ORIGINS_DEV`, `API_ARTIFACT_VERSION_DEV`
- Prod: `GOOGLE_CLIENT_ID_PROD`, `GOOGLE_CLIENT_SECRET_NAME_PROD`, `OAUTH_CALLBACK_URLS_PROD`,
  `OAUTH_LOGOUT_URLS_PROD`, `CORS_ALLOW_ORIGINS_PROD`, `API_ARTIFACT_VERSION_PROD`

Bootstrap flow (no Google yet):

- Deploy without setting `GoogleClientId` / `GoogleClientSecretName`
- Read the stack output `CognitoDomain` (and/or `CognitoGoogleIdpRedirectUri`)
- Create/configure the Google OAuth client, then store the client secret in Secrets Manager
- Re-deploy with `GOOGLE_CLIENT_ID(_DEV|_PROD)` and `GOOGLE_CLIENT_SECRET_NAME(_DEV|_PROD)`

Important: in Google Cloud Console, add the Cognito redirect URI(s) (one per stage):

- `https://<your-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

This value is also exported as `CognitoGoogleIdpRedirectUri` from each stack.

### Step-by-step: Enabling Google OAuth (Dev example)

**1. Deploy without Google (first time only)**

```bash
npx cdk deploy "Dev/*" --profile <aws-profile>
```

Note the `CognitoDomain` and `CognitoGoogleIdpRedirectUri` outputs.

**2. Create Google OAuth credentials**

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a new **OAuth 2.0 Client ID** (Web application)
3. Add **Authorized redirect URI**: use the `CognitoGoogleIdpRedirectUri` output, e.g.:
   ```
   https://autonomo-control-dev-<account>.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse
   ```
4. Save the **Client ID** and **Client Secret**

**3. Store the Google client secret in Secrets Manager**

```bash
aws secretsmanager create-secret \
  --name "autonomo-control/google-oauth-client-secret-dev" \
  --secret-string "YOUR_GOOGLE_CLIENT_SECRET" \
  --profile <aws-profile> \
  --region eu-west-1
```

To update an existing secret:

```bash
aws secretsmanager put-secret-value \
  --secret-id "autonomo-control/google-oauth-client-secret-dev" \
  --secret-string "NEW_SECRET_VALUE" \
  --profile <aws-profile> \
  --region eu-west-1
```

**4. Redeploy with Google OAuth enabled**

When enabling Google OAuth on an **existing** stack, you have a few options. You do **not** need to
duplicate values in both `-c` and `--parameters`.

**Recommended (single source of truth): put values in `.env.dev.local` and use the helper script**

This will load env vars and (on `deploy`) automatically pass the corresponding CloudFormation
`--parameters` so you don’t have to type them.

```bash
npm run deploy:dev -- --profile <aws-profile>
```

Why this matters: `cdk deploy` uses **previous stack parameter values** by default
(`--previous-parameters` is `true`). That means changing a parameter *default* via `-c`/env vars
does not update the stack’s stored parameter values unless you explicitly opt out of previous
parameters for that deployment.

**Option A (recommended): set CloudFormation parameters once**
can
This persists the values on the stack. Future deploys can omit these flags.

```bash
npx cdk deploy "Dev/AutonomoControlCdkStack-dev" --profile <aws-profile> \
  --parameters GoogleClientId=YOUR_GOOGLE_CLIENT_ID \
  --parameters GoogleClientSecretName=autonomo-control/google-oauth-client-secret-dev \
  --parameters OAuthCallbackUrls=http://localhost:5173/auth/callback \
  --parameters OAuthLogoutUrls=http://localhost:5173/ \
  --parameters CorsAllowOrigins=http://localhost:5173
```

**Option B: use CDK context/env vars + `--no-previous-parameters` (no duplication)**

Use this if you want to drive the parameter defaults from `-c` / env vars and force CloudFormation
to apply those defaults on this deployment.

```bash
npx cdk deploy "Dev/AutonomoControlCdkStack-dev" --profile <aws-profile> --no-previous-parameters \
  -c devGoogleClientId=YOUR_GOOGLE_CLIENT_ID \
  -c devGoogleClientSecretName=autonomo-control/google-oauth-client-secret-dev \
  -c devOauthCallbackUrls=http://localhost:5173/auth/callback \
  -c devOauthLogoutUrls=http://localhost:5173/ \
  -c devCorsAllowOrigins=http://localhost:5173
```

After Google is enabled, future deploys can usually omit both `-c` and `--parameters` (CDK will
reuse the stack’s previous parameter values). To change values later, pass `--parameters ...` again
or use `--no-previous-parameters` when relying on new defaults.

**5. Update web app configuration**

After enabling Google OAuth, a **new Cognito User Pool Client** is created. Update your web app's
`.env.local` with the new `CognitoUserPoolClientId` from the deployment outputs.

For prod, use `prodGoogleClientId`, `prodGoogleClientSecretName`, etc. (or `GOOGLE_CLIENT_ID_PROD`, etc.).

API Gateway uses a JWT authorizer configured for the stage's Cognito User Pool. Call the API with:

- `Authorization: Bearer <id_token>`

## DynamoDB persistence

This stack provisions DynamoDB tables for users, workspaces, workspace members, workspace records,
and workspace settings with the required GSIs. Table names are
`<tableNamePrefix>-<stage>-<suffix>` (default prefix `autonomo-control`), set via
`-c tableNamePrefix=...` or `TABLE_NAME_PREFIX`. Dev and prod enable PITR and retain on delete.

## Tables

### 1) `users`
- **PK**: `user_id` (string)
- **Attributes**: `email`, `google_sub`, `preferred_language`, `created_at`, `updated_at`, ...
- **GSI** `by_email`: PK `email`
- **GSI** `by_google_sub`: PK `google_sub`

The `users` table is populated automatically on the user's first successful login via a Cognito
token-generation trigger (upsert keyed by the Cognito `sub` as `user_id`).

### 2) `workspaces`
- **PK**: `workspace_id` (string)
- **Attributes**: `name`, `owner_user_id`, `created_at`, ...
- **GSI** `by_owner_user_id`: PK `owner_user_id`, SK `workspace_id`

### 3) `workspace_members`
Supports both “member already has a user” and “invited by email” flows.
- **PK**: `workspace_id` (string)
- **SK**: `member_key` (string) e.g. `USER#<user_id>` or `EMAIL#<lowercased_email>`
- **Attributes**: `user_id` (nullable), `email_lower` (nullable), `role`, `status`, `invited_at`, ...
- **GSI** `by_user_id`: PK `user_id`, SK `workspace_id`
- **GSI** `by_email`: PK `email_lower`, SK `workspace_id`

### 4) `workspace_records` (Invoices/Expenses/StatePayments/Transfers/BudgetEntries)
Single table for all workspace-scoped financial records.

- **PK**: `workspace_id` (string)
- **SK**: `record_key` (string) = `<TYPE>#<event_date>#<record_id>`
    - `TYPE` one of `INVOICE|BUSINESS_ENTITY_INVOICE|EXPENSE|STATE_PAYMENT|TRANSFER|BUDGET`
    - `event_date` ISO date `YYYY-MM-DD` used for month/quarter grouping:
        - Invoice: `paymentDate ?: invoiceDate`
        - Expense: `paymentDate ?: documentDate`
        - StatePayment: `paymentDate`
        - Transfer: `date`
        - BudgetEntry: `monthKey.firstDay()` (store as `YYYY-MM-01`)
    - `record_id` recommended `ULID` (sortable) or `UUID`
- **Attributes (recommended)**:
    - `record_id`, `record_type`, `event_date`, plus the model-specific payload (Money as string/decimal, dates as ISO string, enums as string, etc.)
    - `workspace_month` = `WS#<workspace_id>#M#YYYY-MM` (derived from `event_date`)
    - `workspace_quarter` = `WS#<workspace_id>#Q#YYYY-Q<1..4>` (derived from `event_date`)
- **GSI** `by_month`: PK `workspace_month`, SK `record_key`
- **GSI** `by_quarter`: PK `workspace_quarter`, SK `record_key`

This allows:
- get a record by `(workspace_id, record_key)` (fast point lookup)
- query all records in a month with `workspace_month`
- query all records in a quarter with `workspace_quarter`
- query only invoices in a month by `workspace_month` + `begins_with(record_key, "INVOICE#")`

### 5) `workspace_settings`
One settings item per workspace.
- **PK**: `workspace_id` (string)
- **Attributes**: `year`, `start_date`, `iva_std`, `irpf_rate`, `obligacion130`, `opening_balance`, `expense_categories`, ...

# dynamodb table names on dev stage
- autonomo-control-dev-users
- autonomo-control-dev-workspace_members
- autonomo-control-dev-workspace_records
- autonomo-control-dev-workspace_settings
- autonomo-control-dev-workspaces

# dynamodb table names on prod stage
- autonomo-control-prod-users
- autonomo-control-prod-workspace_members
- autonomo-control-prod-workspace_records
- autonomo-control-prod-workspace_settings
- autonomo-control-prod-workspaces

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk list`    list available stacks
* More deploy/diff/synth examples: copy `docs/USEFUL_COMMANDS.md.example` → `docs/USEFUL_COMMANDS.md` (local-only; gitignored)
