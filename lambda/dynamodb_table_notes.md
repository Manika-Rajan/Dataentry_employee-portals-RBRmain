# DynamoDB Table Notes

Recommended table name:

```text
rbrmain-export-companies
```

Primary key:

```text
PK: country_product_key (String)
SK: sk (String)
```

This enables efficient query for:

```text
Malaysia + Readymade Garments
```

using:

```text
country_product_key = malaysia#readymade_garments
```

The employee portal writes records like:

```json
{
  "country_product_key": "malaysia#readymade_garments",
  "sk": "padini_holdings_berhad#uuid",
  "company_name": "Padini Holdings Berhad",
  "country": "Malaysia",
  "product": "Readymade Garments",
  "search_terms": ["malaysia", "readymade_garments", "padini_holdings_berhad"]
}
```

For future Excel import, reuse the same payload format.
