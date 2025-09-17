# DOL Form 5500 Data Schema Documentation

## Data Source
- **URL Pattern**: `https://askebsa.dol.gov/FOIA%20Files/[YEAR]/Latest/F_5500_[YEAR]_Latest.zip`
- **Example 2024**: https://askebsa.dol.gov/FOIA%20Files/2024/Latest/F_5500_2024_Latest.zip
- **Update Frequency**: Monthly (around 1st of each month)
- **File Size**: 100-500MB compressed, 1-3GB uncompressed

## ZIP File Contents
```
F_5500_2024_Latest.zip/
├── f_5500_2024_latest.csv        # Main form data (800,000+ rows)
├── f_sch_a_2024_latest.csv       # Schedule A - Insurance Information
├── f_sch_c_2024_latest.csv       # Schedule C - Service Provider Information
├── f_sch_d_2024_latest.csv       # Schedule D - DFE/Participating Plan Info
├── f_sch_g_2024_latest.csv       # Schedule G - Financial Transaction
├── f_sch_h_2024_latest.csv       # Schedule H - Financial Information
├── f_sch_i_2024_latest.csv       # Schedule I - Financial Info (Small Plans)
├── f_sch_r_2024_latest.csv       # Schedule R - Retirement Plan Info
├── f_sch_mb_2024_latest.csv      # Schedule MB - Multiemployer Plans
└── f_sch_sb_2024_latest.csv      # Schedule SB - Single Employer Plans
```

## Main Form (f_5500_2024_latest.csv) Schema

### Key Fields We Use:
| Field Name | Description | Example |
|------------|-------------|---------|
| **ACK_ID** | Unique filing ID | 20240123456789 |
| **FORM_PLAN_YEAR_BEGIN_DATE** | Plan year start | 20240101 |
| **FORM_TAX_PRD** | Tax period | 2024 |
| **TYPE_PLAN_ENTITY_CD** | Plan type code | 2E (401k) |
| **INITIAL_FILING_IND** | First time filing | 0 or 1 |
| **AMENDED_IND** | Is amended | 0 or 1 |
| **FINAL_FILING_IND** | Final return | 0 or 1 |
| **SHORT_PLAN_YR_IND** | Short plan year | 0 or 1 |
| **PLAN_NAME** | Official plan name | ACME CORP 401(K) PLAN |

### Sponsor (Employer) Information:
| Field Name | Description | Example |
|------------|-------------|---------|
| **SPONS_DFE_EIN** | Employer EIN | 123456789 |
| **SPONSOR_DFE_NAME** | Employer name | ACME CORPORATION |
| **SPONS_DFE_DBA_NAME** | DBA name | ACME |
| **SPONS_DFE_CARE_OF_NAME** | Care of name | |
| **SPONS_DFE_MAIL_US_ADDRESS1** | Address line 1 | 123 MAIN ST |
| **SPONS_DFE_MAIL_US_ADDRESS2** | Address line 2 | SUITE 100 |
| **SPONS_DFE_MAIL_US_CITY** | City | SAN FRANCISCO |
| **SPONS_DFE_MAIL_US_STATE** | State | CA |
| **SPONS_DFE_MAIL_US_ZIP** | ZIP code | 94105 |
| **SPONS_DFE_PHONE_NUM** | Phone | 4155551234 |
| **BUSINESS_CODE** | NAICS code | 541511 |

### Plan Information:
| Field Name | Description | Example |
|------------|-------------|---------|
| **PLAN_NUM** | Plan number | 001 |
| **PLAN_EFF_DATE** | Effective date | 19850101 |
| **TOT_PARTCP_BOB_CNT** | Participants begin of year | 1250 |
| **TOT_PARTCP_EOY_CNT** | Participants end of year | 1300 |
| **TOT_ACTIVE_PARTCP_CNT** | Active participants | 1200 |
| **RTD_SEP_PARTCP_RCVG_CNT** | Retired/separated receiving | 100 |
| **RTD_SEP_PARTCP_FUT_CNT** | Retired/separated future | 50 |
| **SUBTL_ACT_RTD_SEP_CNT** | Subtotal active/retired | 1350 |
| **BENEF_RCVG_BNFT_CNT** | Beneficiaries receiving | 25 |
| **TOT_ACT_RTD_SEP_BENEF_CNT** | Total all categories | 1375 |
| **PARTCP_ACCOUNT_BAL_CNT** | Participants with balance | 1300 |

### Financial Information:
| Field Name | Description | Example |
|------------|-------------|---------|
| **TOT_ASSETS_BOB_AMT** | Total assets begin of year | 125000000.00 |
| **TOT_ASSETS_EOY_AMT** | Total assets end of year | 135000000.00 |
| **TOT_LIABILITIES_BOB_AMT** | Liabilities begin of year | 1000000.00 |
| **TOT_LIABILITIES_EOY_AMT** | Liabilities end of year | 1200000.00 |
| **NET_ASSETS_BOB_AMT** | Net assets begin of year | 124000000.00 |
| **NET_ASSETS_EOY_AMT** | Net assets end of year | 133800000.00 |

### Plan Type Codes (TYPE_PLAN_ENTITY_CD):
```
2A = Money purchase (other than target benefit)
2B = Target benefit
2C = Money purchase (individual account)
2D = Defined benefit (other)
2E = Defined benefit (individual account) - Most common 401(k)
2F = Defined benefit
2G = ESOP
2H = Governmental
2I = Church
2J = 403(b)
2K = Other
2L = Profit sharing
2M = Stock bonus
2R = KSOP
2S = SEP
2T = Savings/thrift
3A = Health (other than disability)
3B = Life insurance
3C = Supplemental unemployment
3D = Disability
3E = Death benefit (other than life insurance)
3F = Prepaid legal
3G = Scholarship
3H = Apprenticeship/training
```

## How We Process This Data:

1. **Download ZIP file** (100-500MB)
2. **Extract in memory** using Node.js streams
3. **Parse CSV** row by row (streaming to handle large files)
4. **Extract key fields** we need for search:
   - EIN, Plan Number (unique identifier)
   - Plan Name, Sponsor Name (for search)
   - Location (city, state, ZIP)
   - Participants and Assets (for ranking)
   - Plan Type (401k, 403b, etc.)
5. **Calculate search rank** based on:
   - Total assets (log scale)
   - Number of participants
   - Data completeness
6. **Store in BigQuery** for analytics (all 800,000+ plans)
7. **Cache in Firestore** (top 5,000 plans by rank)

## Data Quality Considerations:

- **Missing data**: Many fields can be null/empty
- **Data formats**: Dates are YYYYMMDD strings
- **EIN format**: May have hyphens or not (12-3456789 vs 123456789)
- **Plan numbers**: Usually 001, 002, etc. but can vary
- **Amount fields**: Stored as decimals with 2 decimal places
- **State codes**: Always 2-letter uppercase

## Sample Data Row (simplified):
```csv
ACK_ID,SPONS_DFE_EIN,PLAN_NUM,PLAN_NAME,SPONSOR_DFE_NAME,TOT_PARTCP_BOB_CNT,TOT_ASSETS_BOB_AMT
20240000001,123456789,001,ACME CORP 401(K) PLAN,ACME CORPORATION,1250,125000000.00
20240000002,987654321,001,TECH STARTUP RETIREMENT,TECH STARTUP INC,50,2500000.00
```