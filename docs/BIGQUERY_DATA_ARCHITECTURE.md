# BigQuery Data Architecture & Ingestion Strategy

> **⚠️ CRITICAL**: This document prevents costly mistakes when ingesting DOL data

## 🚨 Problem Discovered (September 2025)

**MISTAKE**: Created two separate datasets that cannot be properly joined:
- `dol_data` dataset (US region)
- `retirement_plans` dataset (different region/location)

**RESULT**: Cross-dataset JOINs fail with location errors, breaking sponsor search functionality.

## ✅ CORRECT Architecture Moving Forward

### Single Dataset Strategy

**ALL DOL data MUST go in `dol_data` dataset:**

```
trustrails-faa3e.dol_data/
├── schedule_c_custodians     (✅ EXISTS - 36,686 records)
├── plan_sponsors             (✅ EXISTS - 0 records, POPULATE THIS)
├── form5500_main_filings     (📋 FUTURE - historical data)
└── schedule_a_insurance      (📋 FUTURE - if needed)
```

### Core Tables Schema

#### 1. `schedule_c_custodians` (Custodian Data)
```sql
CREATE TABLE `trustrails-faa3e.dol_data.schedule_c_custodians` (
  ack_id STRING,                    -- JOIN KEY
  ein_plan_sponsor STRING,          -- Secondary JOIN key
  plan_number STRING,               -- Secondary JOIN key
  plan_name STRING,
  provider_other_name STRING,       -- Custodian name
  provider_other_ein INTEGER,
  provider_other_relation STRING,
  provider_other_us_city STRING,
  provider_other_us_state STRING,
  provider_other_us_zip INTEGER,
  provider_other_us_address1 STRING,
  provider_other_us_address2 STRING,
  form_tax_year INTEGER,
  file_source STRING,
  extraction_date TIMESTAMP
)
PARTITION BY form_tax_year
CLUSTER BY provider_other_name, ack_id
```

#### 2. `plan_sponsors` (Sponsor/Employer Data)
```sql
CREATE TABLE `trustrails-faa3e.dol_data.plan_sponsors` (
  ack_id STRING,                    -- PRIMARY JOIN KEY with schedule_c_custodians
  ein_plan_sponsor STRING,          -- Plan sponsor EIN
  plan_number STRING,               -- Plan number
  plan_name STRING,                 -- Plan name
  sponsor_name STRING,              -- EMPLOYER NAME (for "Microsoft 1990" searches)
  sponsor_city STRING,
  sponsor_state STRING,
  sponsor_zip STRING,
  plan_type STRING,
  participants INTEGER,
  total_assets FLOAT,
  form_tax_year INTEGER,
  file_source STRING,
  extraction_date TIMESTAMP
)
PARTITION BY form_tax_year
CLUSTER BY sponsor_name, ack_id
```

## 🔗 JOIN Strategy

### Complete Sponsor-Custodian Search
```sql
SELECT
  ps.sponsor_name,
  ps.plan_name,
  cc.provider_other_name as custodian_name,
  ps.participants,
  ps.total_assets,
  ps.form_tax_year
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc
  ON ps.ack_id = cc.ack_id
WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
ORDER BY ps.form_tax_year DESC
```

## 📋 Data Ingestion Rules

### Rule 1: Single Dataset Only
- ✅ **DO**: All DOL data goes in `dol_data` dataset
- ❌ **DON'T**: Create separate datasets for different data types

### Rule 2: Consistent Location
- ✅ **DO**: Use `US` region for all tables
- ❌ **DON'T**: Mix regions/locations within project

### Rule 3: Maintain JOIN Keys
- ✅ **DO**: Always preserve `ack_id` for JOIN relationships
- ✅ **DO**: Include `ein_plan_sponsor` + `plan_number` as backup JOIN
- ❌ **DON'T**: Create tables without proper JOIN keys

### Rule 4: Consistent Partitioning
- ✅ **DO**: Partition by `form_tax_year` for time-based queries
- ✅ **DO**: Cluster by most-searched columns (sponsor_name, provider_name, ack_id)

## 🚀 Historical Data Ingestion (2020-2023)

### Step 1: Populate plan_sponsors Table
```bash
# Extract sponsor data from retirement_plans.form5500_latest
# OR download historical Form 5500 main filings
# Load into dol_data.plan_sponsors with proper ack_id mapping
```

### Step 2: Add Historical Custodian Data
```bash
# Download Schedule C data for 2020-2023
# Load into dol_data.schedule_c_custodians
# Ensure same schema and partitioning
```

### Step 3: Verify JOIN Integrity
```sql
-- Test JOIN works across all years
SELECT
  COUNT(*) as total_joined_records,
  COUNT(DISTINCT ps.ack_id) as unique_plans,
  MIN(ps.form_tax_year) as earliest_year,
  MAX(ps.form_tax_year) as latest_year
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc
  ON ps.ack_id = cc.ack_id
```

## 🛠️ Migration Plan for Current Data

### Immediate Fix (Required)
1. **Copy sponsor data** from `retirement_plans.form5500_latest` to `dol_data.plan_sponsors`
2. **Map ack_id relationships** between sponsors and custodians
3. **Test search functionality** with Microsoft and other major employers
4. **Update search API** to use single-dataset JOINs

### Migration Script Template
```typescript
// services/dol-processor/migrate-sponsor-data.ts
async function migrateSponsorData() {
  // 1. Extract from retirement_plans.form5500_latest
  const extractQuery = `
    SELECT
      ein,
      planNumber,
      planName,
      sponsorName,
      sponsorCity,
      sponsorState,
      sponsorZip,
      planType,
      participants,
      totalAssets,
      formYear
    FROM \`trustrails-faa3e.retirement_plans.form5500_latest\`
  `;

  // 2. Match with ack_id from schedule_c_custodians
  // 3. Insert into dol_data.plan_sponsors with ack_id
}
```

## 📊 Search API Integration

### Updated Search Query Pattern
```typescript
// Single dataset, fast JOIN
async function searchSponsorsAndCustodians(query: string) {
  const sqlQuery = `
    SELECT
      ps.sponsor_name,
      ps.plan_name,
      cc.provider_other_name as custodian_name,
      ps.participants,
      ps.total_assets,
      ps.form_tax_year,
      'sponsor' as search_type
    FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
    JOIN \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    WHERE UPPER(ps.sponsor_name) LIKE UPPER(@query)

    UNION ALL

    SELECT
      NULL as sponsor_name,
      cc.plan_name,
      cc.provider_other_name as custodian_name,
      NULL as participants,
      NULL as total_assets,
      cc.form_tax_year,
      'custodian' as search_type
    FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
    WHERE UPPER(cc.provider_other_name) LIKE UPPER(@query)

    ORDER BY form_tax_year DESC
    LIMIT 50
  `;
}
```

## ⚠️ What NOT To Do

### ❌ Multiple Datasets
```bash
# DON'T CREATE:
retirement_plans_2023/
retirement_plans_2022/
dol_schedule_c/
dol_form5500/
```

### ❌ Cross-Dataset JOINs
```sql
-- DON'T DO THIS (will fail):
FROM `project.dataset1.table1` t1
JOIN `project.dataset2.table2` t2
  ON t1.id = t2.id
```

### ❌ Missing JOIN Keys
```sql
-- DON'T CREATE tables without ack_id:
CREATE TABLE plan_data (
  sponsor_name STRING,
  plan_name STRING
  -- Missing: ack_id STRING ❌
)
```

## 🎯 Success Metrics

After proper implementation:
- ✅ "Microsoft 1990" searches return results
- ✅ Single-dataset JOINs work without location errors
- ✅ Sub-100ms query performance with proper clustering
- ✅ Historical data (2020-2023) accessible in same queries
- ✅ Cache warming covers both sponsor and custodian searches

## 📞 Emergency Contacts

If data ingestion goes wrong:
1. **STOP** all ingestion processes
2. Check this document for proper table structure
3. Verify all data goes in `dol_data` dataset
4. Test JOIN queries before promoting to production

## 🎉 SOLUTION IMPLEMENTED (September 2025)

### ✅ Cross-Region Issue Resolved

**Problem**: Two datasets in different regions couldn't be joined:
- `retirement_plans` dataset (us-central1)
- `dol_data` dataset (US multi-region)

**Solution**: Unified ingestion pipeline created that processes Form 5500 data directly into the correct `dol_data.plan_sponsors` table.

### 📋 Implementation Summary

1. **Recreated Table Schema**: Fixed `plan_sponsors` table with proper Form 5500 sponsor fields
2. **Built Ingestion Pipeline**: `services/dol-processor/ingest-form5500-unified.ts`
3. **Processed Real Data**: Successfully extracted 84,760 sponsor records from 2024 Form 5500
4. **Created Load Job Alternative**: `services/dol-processor/ingest-via-load-job.ts`
5. **Documented Architecture**: This document prevents future mistakes

### 🔧 Scripts Created

- **`recreate-plan-sponsors-table.ts`**: Fixes table schema
- **`transform-csv-for-bigquery.ts`**: Transforms raw CSV to match table schema
- **`upload-csv-to-storage.ts`**: Uploads to Cloud Storage for BigQuery loading
- **`test-microsoft-search.ts`**: Verifies JOIN functionality

## 📝 STEP-BY-STEP INGESTION PROCESS (Use for Historical Data)

### Step 1: Extract Form 5500 Data
```bash
# Download ZIP from Cloud Storage
gsutil cp gs://trustrails-dol-data/form5500_YYYY_YYYY-MM.zip /tmp/

# Extract CSV
unzip /tmp/form5500_YYYY_YYYY-MM.zip -d /tmp/form5500_extract/
```

### Step 2: Transform CSV to Match Table Schema
```typescript
// Use transform-csv-for-bigquery.ts
// Maps 140 Form 5500 columns to our 14-column schema:
// ACK_ID → ack_id
// SPONS_DFE_EIN → ein_plan_sponsor
// SPONSOR_DFE_NAME → sponsor_name
// PLAN_NAME → plan_name
// TYPE_PLAN_ENTITY_CD → plan_type (converted to text)
// TOT_PARTCP_BOY_CNT → participants
// TOT_ASSETS_EOY_AMT → total_assets
```

### Step 3: Upload to Cloud Storage
```bash
# Upload formatted CSV
gsutil cp /tmp/plan_sponsors_formatted.csv gs://trustrails-dol-data/
```

### Step 4: Load into BigQuery using bq CLI
```bash
# IMPORTANT: Use bq CLI, not Node.js client (authentication issues)
~/google-cloud-sdk/bin/bq load \
  --source_format=CSV \
  --skip_leading_rows=1 \
  --allow_jagged_rows \
  --allow_quoted_newlines \
  --replace \
  --project_id=trustrails-faa3e \
  dol_data.plan_sponsors \
  gs://trustrails-dol-data/plan_sponsors_formatted.csv
```

### Step 5: Verify Data and JOINs
```sql
-- Test Microsoft search with JOIN
SELECT
  ps.sponsor_name,
  ps.plan_name,
  cc.provider_other_name as custodian_name,
  ps.participants
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc
  ON ps.ack_id = cc.ack_id
WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
```

## ⚠️ CRITICAL LESSONS LEARNED

### 1. BigQuery Node.js Client Issues
**Problem**: Client uses numeric project ID (209282844702) instead of name
**Solution**: Use bq CLI tool with proper authentication:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-admin.json
~/google-cloud-sdk/bin/bq query --project_id=trustrails-faa3e "YOUR_QUERY"
```

### 2. CSV Column Mismatch
**Problem**: Raw Form 5500 has 140 columns, table expects 14
**Solution**: Always transform CSV before loading (see transform-csv-for-bigquery.ts)

### 3. Cross-Region Dataset Errors
**Problem**: Cannot JOIN datasets in different regions
**Solution**: ALL tables MUST be in same dataset (`dol_data`) in US region

### 4. String Escaping in SQL
**Problem**: Single quotes in company names break INSERT statements
**Solution**: Use CSV loading via Cloud Storage instead of SQL INSERT

## 📊 Current Status

```sql
-- Now works perfectly - single dataset JOIN
SELECT
  ps.sponsor_name,
  ps.plan_name,
  cc.provider_other_name as custodian_name,
  ps.participants,
  ps.total_assets
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc
  ON ps.ack_id = cc.ack_id
WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
ORDER BY ps.form_tax_year DESC
```

**Results**:
- Microsoft Corporation: 177,531 participants
- Primary Custodian: Fidelity Investments Institutional
- JOIN working perfectly in single dataset

### 🚀 Ready for Historical Data

The unified pipeline can now ingest:
- **2024**: ✅ Completed (84,760 records loaded)
- **2023, 2022, 2021, 2020**: Use same process above
- **1990s**: For "Microsoft 1990" employee searches

---

**Last Updated**: September 2025
**Status**: ✅ RESOLVED - Unified dataset architecture implemented
**Critical Lesson**: Never create separate datasets for related DOL data that need to be joined.