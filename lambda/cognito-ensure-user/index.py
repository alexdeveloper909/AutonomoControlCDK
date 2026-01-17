import datetime
import json
import os
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError


_dynamodb = boto3.resource("dynamodb")


def _extract_google_sub_from_identities(identities_raw: Optional[str]) -> Optional[str]:
    if not identities_raw:
        return None
    try:
        identities = json.loads(identities_raw)
        if not isinstance(identities, list):
            return None
        for identity in identities:
            if not isinstance(identity, dict):
                continue
            provider_name = str(identity.get("providerName", "")).lower()
            provider_type = str(identity.get("providerType", "")).lower()
            if provider_name == "google" or provider_type == "google":
                user_id = identity.get("userId") or identity.get("user_id")
                return str(user_id) if user_id else None
        return None
    except Exception:
        return None


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    table_name = os.environ.get("USERS_TABLE_NAME")
    if not table_name:
        print("Missing env var USERS_TABLE_NAME")
        return event

    trigger_source = event.get("triggerSource")
    if trigger_source == "TokenGeneration_RefreshTokens":
        return event

    user_attributes = ((event.get("request") or {}).get("userAttributes") or {})
    user_id = user_attributes.get("sub")
    if not user_id:
        return event

    now = datetime.datetime.now(datetime.UTC).isoformat()

    email = user_attributes.get("email")
    google_sub = _extract_google_sub_from_identities(user_attributes.get("identities"))
    cognito_username = event.get("userName")

    item: Dict[str, Any] = {
        "user_id": str(user_id),
        "created_at": now,
        "updated_at": now,
    }

    if email:
        item["email"] = str(email)
        item["email_lower"] = str(email).lower()
    if user_attributes.get("given_name"):
        item["given_name"] = str(user_attributes["given_name"])
    if user_attributes.get("family_name"):
        item["family_name"] = str(user_attributes["family_name"])
    if google_sub:
        item["google_sub"] = google_sub
    if cognito_username:
        item["cognito_username"] = str(cognito_username)

    try:
        update_parts = [
            "created_at = if_not_exists(created_at, :now)",
            "updated_at = :now",
        ]
        expr_values: Dict[str, Any] = {":now": now}

        if email:
            update_parts.append("email = :email")
            update_parts.append("email_lower = :email_lower")
            expr_values[":email"] = str(email)
            expr_values[":email_lower"] = str(email).lower()
        if user_attributes.get("given_name"):
            update_parts.append("given_name = :given_name")
            expr_values[":given_name"] = str(user_attributes["given_name"])
        if user_attributes.get("family_name"):
            update_parts.append("family_name = :family_name")
            expr_values[":family_name"] = str(user_attributes["family_name"])
        if google_sub:
            update_parts.append("google_sub = :google_sub")
            expr_values[":google_sub"] = google_sub
        if cognito_username:
            update_parts.append("cognito_username = :cognito_username")
            expr_values[":cognito_username"] = str(cognito_username)

        _dynamodb.Table(table_name).update_item(
            Key={"user_id": str(user_id)},
            UpdateExpression="SET " + ", ".join(update_parts),
            ExpressionAttributeValues=expr_values,
        )
    except ClientError as e:
        print(
            "Failed to ensure user row in DynamoDB",
            {
                "error": str(e),
                "userId": str(user_id),
                "triggerSource": trigger_source,
            },
        )
    except Exception as e:
        print(
            "Failed to ensure user row in DynamoDB",
            {"error": str(e), "userId": str(user_id), "triggerSource": trigger_source},
        )

    return event
