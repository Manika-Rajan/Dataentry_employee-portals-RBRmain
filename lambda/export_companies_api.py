import os
import json
import uuid
import re
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr

TABLE_NAME = os.environ.get("EXPORT_COMPANIES_TABLE", "rbrmain-export-companies")
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
EMPLOYEE_PORTAL_KEY = os.environ.get("EMPLOYEE_PORTAL_KEY", "change-this-temp-key")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def clean_for_json(obj):
    if isinstance(obj, list):
        return [clean_for_json(x) for x in obj]
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj


def resp(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": CORS_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type,x-employee-portal-key",
            "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        },
        "body": json.dumps(clean_for_json(body), default=str),
    }


def normalize(value):
    value = str(value or "").strip().lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def require_auth(event):
    headers = event.get("headers") or {}
    supplied = headers.get("x-employee-portal-key") or headers.get("X-Employee-Portal-Key")
    return bool(supplied and supplied == EMPLOYEE_PORTAL_KEY)


def parse_body(event):
    return json.loads(event.get("body") or "{}")


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return resp(200, {"ok": True})

    if not require_auth(event):
        return resp(401, {"message": "Unauthorized employee portal request"})

    method = event.get("httpMethod", "GET")
    path_params = event.get("pathParameters") or {}

    try:
        if method == "POST":
            return save_company(parse_body(event))
        if method == "PUT":
            body = parse_body(event)
            body["company_id"] = body.get("company_id") or path_params.get("company_id")
            return save_company(body)
        if method == "GET":
            return list_companies(event.get("queryStringParameters") or {})
        return resp(405, {"message": "Method not allowed"})
    except Exception as exc:
        print("ERROR", repr(exc))
        return resp(500, {"message": str(exc)})


def save_company(item):
    company_name = (item.get("company_name") or "").strip()
    country = (item.get("country") or "").strip()
    product = (item.get("product") or item.get("product_category") or "").strip()

    if not company_name or not country or not product:
        return resp(400, {"message": "company_name, country and product are required"})

    country_key = item.get("country_key") or normalize(country)
    product_key = item.get("product_key") or normalize(product)
    company_key = item.get("company_key") or normalize(company_name)
    company_id = item.get("company_id") or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    record = {
        **item,
        "company_id": company_id,
        "company_name": company_name,
        "country": country,
        "product": product,
        "priority": int(item.get("priority") or 3),
        "verified": bool(item.get("verified", True)),
        "active": bool(item.get("active", True)),
        "country_key": country_key,
        "product_key": product_key,
        "company_key": company_key,
        "country_product_key": f"{country_key}#{product_key}",
        "sk": f"{company_key}#{company_id}",
        "created_at": item.get("created_at") or now,
        "updated_at": now,
    }

    table.put_item(Item=record)
    return resp(200, {"ok": True, "item": record})


def keyword_match(item, q):
    if not q:
        return True
    q_key = normalize(q)
    blob = " ".join([
        str(item.get("company_name", "")),
        str(item.get("country", "")),
        str(item.get("product", item.get("product_category", ""))),
        str(item.get("city", "")),
        str(item.get("type", "")),
        str(item.get("brands", "")),
        str(item.get("supply_requested", "")),
        str(item.get("company_briefing", "")),
        " ".join(item.get("search_terms") or []),
    ])
    return q_key in normalize(blob)


def list_companies(params):
    country_key = normalize(params.get("country"))
    product_key = normalize(params.get("product"))
    q = params.get("q") or ""

    if country_key and product_key:
        result = table.query(
            KeyConditionExpression=Key("country_product_key").eq(f"{country_key}#{product_key}"),
            Limit=100,
        )
        items = result.get("Items", [])
    else:
        filters = []
        if country_key:
            filters.append(Attr("country_key").eq(country_key))
        if product_key:
            filters.append(Attr("product_key").eq(product_key))
        kwargs = {"Limit": 100}
        if filters:
            expr = filters[0]
            for f in filters[1:]:
                expr = expr & f
            kwargs["FilterExpression"] = expr
        items = table.scan(**kwargs).get("Items", [])

    items = [x for x in items if keyword_match(x, q)]
    items = sorted(items, key=lambda x: (int(x.get("priority", 3)), str(x.get("company_name", "")).lower()))
    return resp(200, {"items": items[:100]})
