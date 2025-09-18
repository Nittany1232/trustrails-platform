# Historical Plan Search Strategy
> **🎯 Goal**: Enable "1990 Microsoft employee" to find their 401k custodian across decades of corporate and plan evolution

## 🚨 The Challenge: Time Changes Everything

### Real-World Scenario
**User Story**: "I worked for Microsoft from 1990-1995 and want to find my old 401k"

**The Reality**:
- Company names evolve: "Microsoft Corp" → "Microsoft Corporation"
- Plans merge: 3 historical Microsoft plans → 1 current consolidated plan
- EINs change: Corporate restructuring creates new entities
- Record keepers transition: Fidelity may have taken over from previous providers
- Data gaps: Only have 2024 Form 5500 data, need 1990s context

## 🔍 Multi-Dimensional Search Strategy

### 1. Company Name Evolution Tracking

```sql
-- Search variations of company names
SELECT ps.sponsor_name, ps.plan_name, ps.form_tax_year, cc.provider_other_name
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
LEFT JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc ON ps.ack_id = cc.ack_id
WHERE (
  UPPER(ps.sponsor_name) LIKE '%MICROSOFT%' OR
  UPPER(ps.sponsor_name) LIKE '%MICRO SOFT%' OR
  UPPER(ps.sponsor_name) LIKE '%MS CORP%' OR
  UPPER(ps.sponsor_name) LIKE '%MICROSOFT CORPORATION%'
)
ORDER BY ps.form_tax_year DESC
```

**Common Corporate Name Patterns**:
- `Microsoft Corporation` (current legal name)
- `Microsoft Corp.` (abbreviated)
- `Microsoft, Inc.` (historical incorporation)
- `MS Corp` (informal variations)

### 2. Plan Name Archaeology

```sql
-- Look for historical references in current plan names
SELECT ps.sponsor_name, ps.plan_name, cc.provider_other_name
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
LEFT JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc ON ps.ack_id = cc.ack_id
WHERE (
  UPPER(ps.plan_name) LIKE '%FORMERLY%' OR
  UPPER(ps.plan_name) LIKE '%SUCCESSOR%' OR
  UPPER(ps.plan_name) LIKE '%MERGED%' OR
  UPPER(ps.plan_name) LIKE '%CONSOLIDATED%'
)
AND UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
```

**Plan Evolution Patterns**:
- "Microsoft Corporation 401(k) Savings Plan" (current)
- "Microsoft Corp Retirement Savings Plan" (historical)
- "Microsoft Employee Stock Purchase Plan" (related but separate)
- "Former XYZ Corp Plan (merged 1995)" (acquisition integration)

### 3. EIN Stability vs. Changes

**EINs are most stable BUT can change due to**:
- Corporate restructuring
- Spin-offs/acquisitions
- Legal entity changes
- Plan mergers

```sql
-- Track EIN relationships in plan notes
SELECT ps.sponsor_name, ps.ein_plan_sponsor, ps.plan_name
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
GROUP BY ps.ein_plan_sponsor, ps.sponsor_name, ps.plan_name
ORDER BY ps.ein_plan_sponsor
```

## 🎯 Recommended Search UX Flow

### Step 1: "Tell us about your employment"
```typescript
interface EmploymentSearch {
  companyName: string;        // "Microsoft" (with autocomplete)
  employmentStartYear: number; // 1990
  employmentEndYear?: number;   // 1995 (optional)
  location?: string;           // "Redmond, WA" (optional)
  department?: string;         // "Windows Division" (optional)
}
```

### Step 2: "Smart search results with confidence indicators"

**🟢 High Confidence Results**:
```
Microsoft Corporation 401(k) Savings Plan
✅ Current active plan | 🏢 Same company | 👥 45,000 participants
💼 Contact: Fidelity Investments (Record Keeper)
📧 microsoft-benefits@fidelity.com | ☎️ 1-800-FIDELITY
```

**🟡 Medium Confidence Results**:
```
Microsoft Savings Plan (Terminated 1999)
📅 Historical plan, merged into current plan | 🔄 Data transferred
💼 Contact: Microsoft HR Benefits Team
📧 benefits@microsoft.com | ☎️ 1-425-882-8080
```

**🟠 Needs Investigation**:
```
MS Corp Employee Plan (Possible Match)
❓ Verify employment details and dates
💼 Contact: Plan Administrator for verification
📋 Additional info needed: Employee ID, Social Security Number
```

### Step 3: "No matches? Try these alternatives"

```typescript
interface FallbackStrategies {
  broaderSearch: string[];     // ["Technology Companies 1990s", "Seattle Area Plans"]
  externalResources: {
    dolLostFound: string;      // "https://efast.dol.gov"
    companyHR: string;         // "Microsoft Benefits Hotline"
    planSearch: string;        // "DOL Plan Search Database"
  };
  manualResearch: boolean;     // Enable research team contact
}
```

## 📊 Plan Continuity Patterns

### Pattern 1: Plan Mergers/Consolidations
```sql
-- Identify merged plans (when we get historical data)
SELECT sponsor_name, plan_name, form_tax_year
FROM historical_form5500_data
WHERE plan_status = 'M' -- Merged
  AND final_filing_yn = 'Y'
  AND UPPER(sponsor_name) LIKE '%MICROSOFT%'
ORDER BY form_tax_year DESC
```

### Pattern 2: Corporate Restructuring
```sql
-- Track successor relationships
SELECT
  ps.sponsor_name,
  ps.ein_plan_sponsor,
  ps.plan_name,
  CASE
    WHEN ps.plan_name LIKE '%successor%' THEN 'SUCCESSOR_PLAN'
    WHEN ps.plan_name LIKE '%merged%' THEN 'MERGED_PLAN'
    ELSE 'CURRENT_PLAN'
  END as plan_status
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
```

### Pattern 3: Service Provider Transitions
```sql
-- Current record keeper likely maintains historical records
SELECT DISTINCT cc.provider_other_name, COUNT(*) as plan_count
FROM `trustrails-faa3e.dol_data.schedule_c_custodians` cc
JOIN `trustrails-faa3e.dol_data.plan_sponsors` ps ON cc.ack_id = ps.ack_id
WHERE UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
GROUP BY cc.provider_other_name
ORDER BY plan_count DESC
```

## 🔄 Historical Data Strategy

### Immediate Solutions (2024 data only)

**1. Plan Name Archaeology**
```sql
-- Find plans with historical references
SELECT ps.sponsor_name, ps.plan_name, cc.provider_other_name
FROM `trustrails-faa3e.dol_data.plan_sponsors` ps
LEFT JOIN `trustrails-faa3e.dol_data.schedule_c_custodians` cc ON ps.ack_id = cc.ack_id
WHERE (
  UPPER(ps.plan_name) LIKE '%MICROSOFT%' OR
  UPPER(ps.sponsor_name) LIKE '%MICROSOFT%'
) AND (
  UPPER(ps.plan_name) LIKE '%FORMERLY%' OR
  UPPER(ps.plan_name) LIKE '%SUCCESSOR%' OR
  UPPER(ps.plan_name) LIKE '%MERGED%'
)
```

**2. Record Keeper Intelligence**
```
If Microsoft's current plan uses Fidelity:
→ Fidelity likely maintains historical participant records
→ Contact Fidelity's historical accounts department
→ They often handle transfers from previous record keepers
```

### Enhanced Solutions (Multi-Year Strategy)

**1. Historical DOL Data Acquisition**
```bash
# Download historical Form 5500 datasets
# Priority years for "1990 Microsoft employee":
- 1990-1999: Employment period
- 2000-2010: Post-employment plan changes
- 2011-2024: Recent consolidations

# Implementation:
for year in {1990..2024}; do
  download_form5500_data $year
  ingest_to_unified_dataset $year
done
```

**2. Plan Genealogy Database**
```sql
CREATE TABLE plan_relationships (
  current_ack_id VARCHAR(30),
  historical_ack_id VARCHAR(30),
  relationship_type VARCHAR(20), -- 'MERGER', 'SUCCESSOR', 'SPIN_OFF'
  transition_year INT,
  transition_notes TEXT,
  current_administrator VARCHAR(255),
  current_contact_info TEXT
);
```

**3. Corporate Family Mapping**
```sql
CREATE TABLE corporate_relationships (
  parent_company VARCHAR(255),
  subsidiary_company VARCHAR(255),
  relationship_start_year INT,
  relationship_end_year INT,
  relationship_type VARCHAR(50) -- 'ACQUISITION', 'MERGER', 'SPIN_OFF'
);
```

## 🧠 Smart Search Algorithm

### Fuzzy Matching Implementation
```typescript
interface SearchResult {
  companyMatch: MatchConfidence;
  planMatch: MatchConfidence;
  timelineMatch: MatchConfidence;
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  actionable: boolean;
}

function findHistoricalPlans(searchParams: EmploymentSearch): SearchResult[] {
  const results: SearchResult[] = [];

  // 1. Exact company name match
  results.push(...searchExactCompany(searchParams.companyName));

  // 2. Fuzzy company name matching (Levenshtein distance)
  results.push(...searchFuzzyCompany(searchParams.companyName, 0.8));

  // 3. Parent/subsidiary relationships
  results.push(...searchCorporateFamily(searchParams.companyName));

  // 4. Historical name variations
  results.push(...searchHistoricalVariations(searchParams.companyName));

  // 5. Timeline-aware ranking
  return rankByEmploymentYears(results, searchParams.employmentStartYear);
}
```

### Confidence Scoring
```typescript
function calculateConfidence(result: PlanSearchResult): MatchConfidence {
  let score = 0;

  // Company name exact match: +40 points
  if (result.exactCompanyMatch) score += 40;

  // Company name fuzzy match: +20-35 points based on similarity
  else if (result.fuzzyCompanyMatch) score += result.similarity * 35;

  // Employment year overlap: +30 points
  if (result.timelineOverlap) score += 30;

  // Current plan with historical references: +20 points
  if (result.hasHistoricalReferences) score += 20;

  // Active contact information: +10 points
  if (result.hasActiveContact) score += 10;

  return {
    score,
    level: score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW'
  };
}
```

## 📱 User Experience Implementation

### Progressive Enhancement UX

**Phase 1: Basic Search**
```
Search: [Microsoft                    ] [1990] to [1995]
        [Submit Search]
```

**Phase 2: Enhanced Context**
```
🔍 Advanced Search Options:
Company: [Microsoft Corporation        ] 🔍
Years:   [1990] to [1995]
Location: [Redmond, WA               ] (optional)
Division: [Windows/Office/etc        ] (optional)
```

**Phase 3: Guided Discovery**
```
🎯 Search Results for "Microsoft 1990-1995":

🟢 LIKELY MATCH (High Confidence)
   Microsoft Corporation 401(k) Savings Plan
   📊 Current Plan | 💼 Fidelity | ☎️ Contact Available

🟡 POSSIBLE MATCHES (Medium Confidence)
   Microsoft Legacy Plans (3 found)
   📅 Historical | 🔄 May have merged | 🔍 Needs verification

🔗 EXTERNAL RESOURCES
   📋 DOL Lost and Found Database
   🏢 Microsoft HR Benefits Hotline
   🔍 Manual Research Request
```

## ⚡ Quick Wins Implementation

### 1. Enhanced Company Search
```sql
-- Create company name variations table
CREATE TABLE company_name_variations (
  canonical_name VARCHAR(255),
  variation VARCHAR(255),
  variation_type VARCHAR(50) -- 'ABBREVIATION', 'LEGAL_NAME', 'DBA', 'HISTORICAL'
);

-- Populate with common variations
INSERT INTO company_name_variations VALUES
('Microsoft Corporation', 'Microsoft Corp', 'ABBREVIATION'),
('Microsoft Corporation', 'Microsoft, Inc.', 'HISTORICAL'),
('Microsoft Corporation', 'MS Corp', 'ABBREVIATION'),
('Microsoft Corporation', 'MSFT', 'TICKER_SYMBOL');
```

### 2. Record Keeper Intelligence
```sql
-- Track which record keepers serve major employers
CREATE TABLE record_keeper_relationships (
  company_name VARCHAR(255),
  record_keeper VARCHAR(255),
  relationship_start_year INT,
  specializes_in_historical BOOLEAN,
  contact_info TEXT
);
```

### 3. User Guidance System
```typescript
interface UserGuidance {
  noMatches: {
    message: string;
    alternatives: string[];
    externalResources: ExternalResource[];
  };
  partialMatches: {
    message: string;
    verificationSteps: string[];
    contactInfo: ContactInfo[];
  };
  multipleMatches: {
    message: string;
    disambiguationQuestions: string[];
    rankingCriteria: string[];
  };
}
```

## 🎯 Success Metrics

### User Experience Goals
- **<30 seconds**: Time to find actionable contact information
- **>80% confidence**: For top search result
- **100% coverage**: Every search provides next steps
- **<3 clicks**: To reach contact information

### Search Quality Metrics
- **Precision**: % of results that are actually relevant
- **Recall**: % of relevant plans that are found
- **User satisfaction**: Follow-up survey on successful contacts
- **Resolution rate**: % of users who successfully locate benefits

## 🔄 Next Steps Implementation

### Phase 1: Current Data Enhancement (Next 2 weeks)
1. **Implement fuzzy company search** using existing 2024 data
2. **Create company name variations table** with major employers
3. **Build confidence scoring algorithm** for search results
4. **Add external resource links** (DOL, company HR contacts)

### Phase 2: Historical Data Integration (Next 2 months)
1. **Download Form 5500 data 1990-2023** using existing pipeline
2. **Build plan genealogy tracking** for mergers/successors
3. **Create corporate relationship mapping** for acquisitions
4. **Implement timeline-aware search** across multiple years

### Phase 3: Advanced Features (Next 6 months)
1. **Machine learning plan matching** based on user feedback
2. **Real-time contact verification** for plan administrators
3. **Automated plan genealogy updates** from new Form 5500 data
4. **Integration with DOL Lost and Found** database

The key insight: **Users don't care about technical plan details—they want to know "who do I call to get my money?"** Your search should prioritize getting them to the right current contact, even if their historical plan no longer exists in its original form.