# RBR Export Company Data Entry Portal

Employee portal for adding, searching, and editing export/import company records used by Rajan Business Reports instant reports.

## Local run on Windows CMD

```bat
npm install
copy .env.example .env
npm run dev
```

Open: http://localhost:5173/

## Environment variables

Create `.env`:

```env
VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod
VITE_EMPLOYEE_PORTAL_KEY=replace-with-same-key-as-lambda-env
```

## Main features

- Add company details
- Search by keyword, country, and product
- Edit existing company records
- Auto creates normalized lowercase underscore keys
- Auto creates `search_terms`
- Placeholder button for future Excel upload
- Ready for AWS Amplify hosting

## DynamoDB recommended table

Table name example:

```text
rbrmain-export-companies
```

Primary key:

```text
Partition key: country_product_key  (String)
Sort key: sk                        (String)
```

Example values:

```text
country_product_key = malaysia#readymade_garments
sk = padini_holdings_berhad#<company_id>
```

Important attributes:

```text
company_id
company_name
country
product
company_briefing
brands
supply_requested
email
phone
website
address
city
type
priority
verified
active
country_key
product_key
company_key
search_terms
created_at
updated_at
added_by
```

## API routes expected by frontend

```text
GET  /export-companies?country=Malaysia&product=Readymade%20Garments&q=Padini
POST /export-companies
PUT  /export-companies/{company_id}
```

All requests include header:

```text
x-employee-portal-key: your-secret-key
```

## Lambda

Use:

```text
lambda/export_companies_api.py
```

Lambda environment variables:

```text
EXPORT_COMPANIES_TABLE = rbrmain-export-companies
EMPLOYEE_PORTAL_KEY = same value used in VITE_EMPLOYEE_PORTAL_KEY
CORS_ORIGIN = *
```

Lambda handler:

```text
export_companies_api.handler
```

## API Gateway setup

Create HTTP API routes:

```text
GET     /export-companies
POST    /export-companies
PUT     /export-companies/{company_id}
OPTIONS /export-companies
OPTIONS /export-companies/{company_id}
```

Integrate all routes to the same Lambda.

## Amplify hosting

Connect GitHub repository and use the included `amplify.yml`.

Add Amplify environment variables:

```text
VITE_API_BASE_URL
VITE_EMPLOYEE_PORTAL_KEY
```
