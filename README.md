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
- An API Gateway HTTP API (`$default` route) integrated with the Lambda.

You can deploy different Lambda artifact versions to dev and prod (e.g. test newer versions on dev):

- Global default: `API_ARTIFACT_VERSION=0.0.1` or `-c apiArtifactVersion=0.0.1`
- Dev override: `-c devApiArtifactVersion=0.0.1`
- Prod override: `-c prodApiArtifactVersion=0.0.1`

Lambda environment variables are set per stage:

- `ENV=dev|prod`
- `DDB_TABLE_PREFIX=<tableNamePrefix>-<stage>` (so the Lambda uses the correct DynamoDB tables)

After deployment, see CloudFormation outputs for each stack (API URL, Cognito IDs, etc.).

## Cognito User Pool + Google IdP (dev/prod)

Each stage creates its own Cognito User Pool, User Pool Client, and User Pool Domain. This allows
logging into both dev and prod with the same Google account while keeping completely separate user
pool users (and therefore separate app data per stage).

Google OAuth is optional. The stack will deploy the User Pool + Domain without Google configured so
you can obtain the Cognito domain first (needed to configure the OAuth client in Google Cloud
Console). Google IdP resources are only created when **both** `GoogleClientId` and
`GoogleClientSecretName` are non-empty.

To enable Google OAuth, pass the settings to each stack:

- `GoogleClientId` (OAuth client id)
- `GoogleClientSecretName` (Secrets Manager secret name containing the OAuth client secret as a
  plaintext `SecretString`)
- `OAuthCallbackUrls`, `OAuthLogoutUrls` (comma-separated lists)
- `CorsAllowOrigins` (comma-separated list)

You can provide these either as CloudFormation parameters at deploy time, or via CDK context / env
vars (so they become parameter defaults at synth time):

- Global: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_NAME`, `OAUTH_CALLBACK_URLS`, `OAUTH_LOGOUT_URLS`,
  `CORS_ALLOW_ORIGINS`
- Dev: `GOOGLE_CLIENT_ID_DEV`, `GOOGLE_CLIENT_SECRET_NAME_DEV`, `OAUTH_CALLBACK_URLS_DEV`,
  `OAUTH_LOGOUT_URLS_DEV`, `CORS_ALLOW_ORIGINS_DEV`
- Prod: `GOOGLE_CLIENT_ID_PROD`, `GOOGLE_CLIENT_SECRET_NAME_PROD`, `OAUTH_CALLBACK_URLS_PROD`,
  `OAUTH_LOGOUT_URLS_PROD`, `CORS_ALLOW_ORIGINS_PROD`

Bootstrap flow (no Google yet):

- Deploy without setting `GoogleClientId` / `GoogleClientSecretName`
- Read the stack output `CognitoDomain` (and/or `CognitoGoogleIdpRedirectUri`)
- Create/configure the Google OAuth client, then store the client secret in Secrets Manager
- Re-deploy with `GOOGLE_CLIENT_ID(_DEV|_PROD)` and `GOOGLE_CLIENT_SECRET_NAME(_DEV|_PROD)`

Important: in Google Cloud Console, add the Cognito redirect URI(s) (one per stage):

- `https://<your-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

This value is also exported as `CognitoGoogleIdpRedirectUri` from each stack.

API Gateway uses a JWT authorizer configured for the stage's Cognito User Pool. Call the API with:

- `Authorization: Bearer <id_token>`

## DynamoDB persistence

This stack provisions DynamoDB tables for users, workspaces, workspace members, workspace records,
and workspace settings with the required GSIs. Table names are
`<tableNamePrefix>-<stage>-<suffix>` (default prefix `autonomo-control`), set via
`-c tableNamePrefix=...` or `TABLE_NAME_PREFIX`. Prod enables PITR and uses retain on delete;
non-prod destroys on delete.

## Tables

### 1) `users`
- **PK**: `user_id` (string)
- **Attributes**: `email`, `google_sub`, `created_at`, `updated_at`, ...
- **GSI** `by_email`: PK `email`
- **GSI** `by_google_sub`: PK `google_sub`

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
    - `TYPE` one of `INVOICE|EXPENSE|STATE_PAYMENT|TRANSFER|BUDGET`
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
* `npx cdk deploy AutonomoControlSharedStack --profile tokarevalex` deploy the shared artifact bucket (run once)
* `npx cdk deploy "Dev/*" --profile tokarevalex`   deploy the dev stage (our default region is `eu-west-1`)
* `npx cdk deploy "Prod/*" --profile tokarevalex`  deploy the prod stage (our default region is `eu-west-1`)
* `npx cdk deploy "Dev/AutonomoControlCdkStack-dev" --profile tokarevalex`   deploy only the dev stack
* `npx cdk deploy "Prod/AutonomoControlCdkStack-prod" --profile tokarevalex` deploy only the prod stack
* `npx cdk deploy "Dev/*" -c dev.account=725601752375 -c dev.region=eu-west-1`   override dev env (our AWS account/region)
* `npx cdk deploy "Prod/*" -c prod.account=725601752375 -c prod.region=eu-west-1` override prod env (our AWS account/region)
* `npx cdk deploy "Dev/*" -c devApiArtifactVersion=0.0.1` deploy dev with a specific API artifact version
* `npx cdk deploy "Prod/*" -c prodApiArtifactVersion=0.0.1` deploy prod with a specific API artifact version
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

If you see CDK CLI notices (telemetry / Node support), they are informational. To silence them:
* `npx cdk acknowledge 34892`
* `npx cdk acknowledge 34635`
