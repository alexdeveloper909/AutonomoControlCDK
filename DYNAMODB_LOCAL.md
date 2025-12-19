# DynamoDB Local (macOS) — Create Tables Script

This creates the same DynamoDB tables locally as defined in `DYNAMODB_CDK.md`.

## Prerequisites

- Docker Desktop
- AWS CLI v2 (`aws --version`)

AWS CLI needs credentials even for local DynamoDB; you can use dummy values:

```bash
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=us-east-1
```

## Start DynamoDB Local

```bash
docker run --rm -p 8000:8000 amazon/dynamodb-local \
  -jar DynamoDBLocal.jar -sharedDb -inMemory
```

Endpoint: `http://localhost:8000`

## Script: create all tables

Save as `create_dynamodb_local_tables.sh` and run with `bash create_dynamodb_local_tables.sh`.

```bash
#!/usr/bin/env bash
set -euo pipefail

ENDPOINT_URL="${ENDPOINT_URL:-http://localhost:8000}"
STAGE="${STAGE:-local}"
TABLE_NAME_PREFIX="${TABLE_NAME_PREFIX:-autonomo-control}"

tn() { echo "${TABLE_NAME_PREFIX}-${STAGE}-$1"; }

aws_ddb() {
  aws dynamodb --endpoint-url "$ENDPOINT_URL" "$@"
}

ensure_table() {
  local table_name="$1"
  shift

  if aws_ddb describe-table --table-name "$table_name" >/dev/null 2>&1; then
    echo "OK  table exists: $table_name"
    return 0
  fi

  echo "NEW creating: $table_name"
  aws_ddb create-table --table-name "$table_name" --billing-mode PAY_PER_REQUEST "$@"
  aws_ddb wait table-exists --table-name "$table_name"
  echo "OK  created: $table_name"
}

ensure_table "$(tn users)" \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=email,AttributeType=S \
    AttributeName=google_sub,AttributeType=S \
  --key-schema \
    AttributeName=user_id,KeyType=HASH \
  --global-secondary-indexes '[
    {
      "IndexName": "by_email",
      "KeySchema": [{"AttributeName":"email","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"}
    },
    {
      "IndexName": "by_google_sub",
      "KeySchema": [{"AttributeName":"google_sub","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'

ensure_table "$(tn workspaces)" \
  --attribute-definitions \
    AttributeName=workspace_id,AttributeType=S \
    AttributeName=owner_user_id,AttributeType=S \
  --key-schema \
    AttributeName=workspace_id,KeyType=HASH \
  --global-secondary-indexes '[
    {
      "IndexName": "by_owner_user_id",
      "KeySchema": [
        {"AttributeName":"owner_user_id","KeyType":"HASH"},
        {"AttributeName":"workspace_id","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'

ensure_table "$(tn workspace_members)" \
  --attribute-definitions \
    AttributeName=workspace_id,AttributeType=S \
    AttributeName=member_key,AttributeType=S \
    AttributeName=user_id,AttributeType=S \
    AttributeName=email_lower,AttributeType=S \
  --key-schema \
    AttributeName=workspace_id,KeyType=HASH \
    AttributeName=member_key,KeyType=RANGE \
  --global-secondary-indexes '[
    {
      "IndexName": "by_user_id",
      "KeySchema": [
        {"AttributeName":"user_id","KeyType":"HASH"},
        {"AttributeName":"workspace_id","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    },
    {
      "IndexName": "by_email",
      "KeySchema": [
        {"AttributeName":"email_lower","KeyType":"HASH"},
        {"AttributeName":"workspace_id","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'

ensure_table "$(tn workspace_records)" \
  --attribute-definitions \
    AttributeName=workspace_id,AttributeType=S \
    AttributeName=record_key,AttributeType=S \
    AttributeName=workspace_month,AttributeType=S \
    AttributeName=workspace_quarter,AttributeType=S \
  --key-schema \
    AttributeName=workspace_id,KeyType=HASH \
    AttributeName=record_key,KeyType=RANGE \
  --global-secondary-indexes '[
    {
      "IndexName": "by_month",
      "KeySchema": [
        {"AttributeName":"workspace_month","KeyType":"HASH"},
        {"AttributeName":"record_key","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    },
    {
      "IndexName": "by_quarter",
      "KeySchema": [
        {"AttributeName":"workspace_quarter","KeyType":"HASH"},
        {"AttributeName":"record_key","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]'

ensure_table "$(tn workspace_settings)" \
  --attribute-definitions \
    AttributeName=workspace_id,AttributeType=S \
  --key-schema \
    AttributeName=workspace_id,KeyType=HASH

echo "Done. Tables:"
aws_ddb list-tables --output table
```

## Quick checks

List tables:

```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

