# Welcome to CDK TypeScript project

This is a project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Stages (Dev/Prod)

This project now defines Dev and Prod stages via a shared `AutonomoControlStage` wrapper. Each stage
deploys its own stack (`AutonomoControlCdkStack-dev` and `AutonomoControlCdkStack-prod`) and tags
resources with `Stage=dev` or `Stage=prod`. You can override the target account/region per stage via
CDK context.

The actual deployable stack names include the stage prefix. To see them:

* `npx cdk list`
  * `Dev/AutonomoControlCdkStack-dev`
  * `Prod/AutonomoControlCdkStack-prod`

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
* `npx cdk deploy "Dev/*" --profile tokarevalex`   deploy the dev stage (our default region is `eu-west-1`)
* `npx cdk deploy "Prod/*" --profile tokarevalex`  deploy the prod stage (our default region is `eu-west-1`)
* `npx cdk deploy "Dev/AutonomoControlCdkStack-dev" --profile tokarevalex`   deploy only the dev stack
* `npx cdk deploy "Prod/AutonomoControlCdkStack-prod" --profile tokarevalex` deploy only the prod stack
* `npx cdk deploy "Dev/*" -c dev.account=725601752375 -c dev.region=eu-west-1`   override dev env (our AWS account/region)
* `npx cdk deploy "Prod/*" -c prod.account=725601752375 -c prod.region=eu-west-1` override prod env (our AWS account/region)
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

If you see CDK CLI notices (telemetry / Node support), they are informational. To silence them:
* `npx cdk acknowledge 34892`
* `npx cdk acknowledge 34635`
