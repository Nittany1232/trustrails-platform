-- Manual BigQuery Load Command
-- Run this in the BigQuery console to load Form 5500 data

-- Step 1: Create a temporary external table pointing to the CSV in Cloud Storage
CREATE OR REPLACE EXTERNAL TABLE `trustrails-faa3e.dol_data.temp_form5500_external`
OPTIONS (
  format = 'CSV',
  uris = ['gs://trustrails-dol-data/form5500_2024_2024-09.zip'],
  skip_leading_rows = 1,
  allow_quoted_newlines = false,
  allow_jagged_rows = false
)
AS
SELECT * FROM UNNEST([]) AS dummy;

-- Step 2: Alternative - Upload the extracted CSV to Cloud Storage first
-- Extract the ZIP file and upload the CSV to gs://trustrails-dol-data/form5500_2024_latest.csv

-- Step 3: Load data from CSV into plan_sponsors table
LOAD DATA INTO `trustrails-faa3e.dol_data.plan_sponsors`
FROM FILES (
  format = 'CSV',
  uris = ['gs://trustrails-dol-data/form5500_2024_latest.csv'],
  skip_leading_rows = 1
)
WITH PARTITION COLUMNS (
  -- Auto-partition can be added here if needed
);

-- Alternative: Direct INSERT with sample data for testing
INSERT INTO `trustrails-faa3e.dol_data.plan_sponsors`
(ack_id, ein_plan_sponsor, plan_number, plan_name, sponsor_name,
 sponsor_city, sponsor_state, sponsor_zip, plan_type, participants,
 total_assets, form_tax_year, extraction_date, file_source)
VALUES
('20240101000001NAL0000000001', '123456789', '001', 'Test 401k Plan', 'Test Corporation',
 'San Francisco', 'CA', '94105', 'Defined Contribution Plan', 1000, 50000000.00,
 2024, CURRENT_TIMESTAMP(), 'manual_test'),
('20240101000002NAL0000000002', '987654321', '001', 'Sample Retirement Plan', 'Sample Inc',
 'New York', 'NY', '10001', 'Defined Contribution Plan', 2500, 125000000.00,
 2024, CURRENT_TIMESTAMP(), 'manual_test');

-- Verification queries
SELECT COUNT(*) as total_records FROM `trustrails-faa3e.dol_data.plan_sponsors`;

SELECT sponsor_name, plan_name, participants, total_assets
FROM `trustrails-faa3e.dol_data.plan_sponsors`
LIMIT 10;