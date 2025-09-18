# Sponsor Search Implementation Guide

> **🎯 Goal**: Enable "Microsoft 1990" employee searches to find their 401k custodian

## Current State Analysis

### ✅ What We Have
- **`dol_data.schedule_c_custodians`**: 36,686 custodian records with `ack_id`
- **`retirement_plans.form5500_latest`**: 87,043 sponsor records with `sponsorName`
- **`dol_data.plan_sponsors`**: Empty table ready for population

### ❌ The Problem
**Cross-dataset JOIN fails** between `retirement_plans` and `dol_data` due to location restrictions.

## ✅ Solution: Populate Single Dataset

### Step 1: Data Migration Strategy

**Copy sponsor data** from `retirement_plans.form5500_latest` to `dol_data.plan_sponsors`:

```typescript
// services/dol-processor/migrate-sponsor-data.ts
async function migrateSponsorData() {
  const bigquery = new BigQuery({
    projectId: 'trustrails-faa3e',
    keyFilename: '/path/to/credentials.json'
  });

  // Step 1: Extract sponsor data
  const extractQuery = `
    INSERT INTO \`trustrails-faa3e.dol_data.plan_sponsors\`
    (ein_plan_sponsor, plan_number, plan_name, sponsor_name,
     sponsor_city, sponsor_state, sponsor_zip, plan_type,
     participants, total_assets, form_tax_year, extraction_date)
    SELECT
      ein as ein_plan_sponsor,
      planNumber as plan_number,
      planName as plan_name,
      sponsorName as sponsor_name,
      sponsorCity as sponsor_city,
      sponsorState as sponsor_state,
      sponsorZip as sponsor_zip,
      planType as plan_type,
      participants,
      totalAssets as total_assets,
      CAST(formYear AS INT64) as form_tax_year,
      CURRENT_TIMESTAMP() as extraction_date
    FROM \`trustrails-faa3e.retirement_plans.form5500_latest\`
    WHERE sponsorName IS NOT NULL
  `;

  // Step 2: Add ack_id mapping
  const mapAckIdQuery = `
    UPDATE \`trustrails-faa3e.dol_data.plan_sponsors\` ps
    SET ack_id = cc.ack_id
    FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
    WHERE ps.ein_plan_sponsor = cc.ein_plan_sponsor
      AND ps.plan_number = cc.plan_number
      AND ps.ack_id IS NULL
  `;

  await bigquery.query({ query: extractQuery });
  await bigquery.query({ query: mapAckIdQuery });
}
```

### Step 2: Updated Search API

**Enable sponsor search** alongside custodian search:

```typescript
// services/plan-search-api/enhanced-search.ts
async function searchSponsorsAndCustodians(query: string, limit: number = 20) {
  const bigquery = new BigQuery({
    projectId: 'trustrails-faa3e',
    keyFilename: '/path/to/credentials.json'
  });

  const searchQuery = `
    -- Sponsor search (for "Microsoft 1990" scenarios)
    SELECT
      ps.sponsor_name as result_name,
      ps.plan_name,
      cc.provider_other_name as custodian_name,
      ps.participants,
      ps.total_assets,
      ps.form_tax_year,
      ps.sponsor_city,
      ps.sponsor_state,
      'sponsor' as result_type,
      1 as search_rank
    FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
    JOIN \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    WHERE UPPER(ps.sponsor_name) LIKE UPPER(@query)

    UNION ALL

    -- Custodian search (existing functionality)
    SELECT
      cc.provider_other_name as result_name,
      cc.plan_name,
      cc.provider_other_name as custodian_name,
      NULL as participants,
      NULL as total_assets,
      cc.form_tax_year,
      cc.provider_other_us_city as sponsor_city,
      cc.provider_other_us_state as sponsor_state,
      'custodian' as result_type,
      2 as search_rank
    FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
    WHERE UPPER(cc.provider_other_name) LIKE UPPER(@query)
      AND NOT EXISTS (
        SELECT 1 FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
        WHERE ps.ack_id = cc.ack_id
      )

    ORDER BY search_rank, form_tax_year DESC, result_name
    LIMIT @limit
  `;

  const [results] = await bigquery.query({
    query: searchQuery,
    params: { query: `%${query}%`, limit }
  });

  return results;
}
```

### Step 3: Cache Strategy Update

**Warm cache with sponsor data**:

```typescript
// services/plan-search-api/cache-warmer.ts
async function warmSponsorCache() {
  // Add top 100 employers to Firestore cache
  const topSponsorsQuery = `
    SELECT
      sponsor_name,
      COUNT(*) as plan_count,
      ARRAY_AGG(DISTINCT custodian_name IGNORE NULLS LIMIT 3) as top_custodians
    FROM (
      SELECT
        ps.sponsor_name,
        cc.provider_other_name as custodian_name
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
      JOIN \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
    )
    GROUP BY sponsor_name
    ORDER BY plan_count DESC
    LIMIT 100
  `;

  const [sponsors] = await bigquery.query({ query: topSponsorsQuery });

  const batch = db.batch();
  for (const sponsor of sponsors) {
    const docRef = db.collection('sponsor_cache').doc(sanitizeId(sponsor.sponsor_name));
    batch.set(docRef, {
      name: sponsor.sponsor_name,
      planCount: sponsor.plan_count,
      topCustodians: sponsor.top_custodians,
      searchTerms: generateSearchTerms(sponsor.sponsor_name),
      lastUpdated: admin.firestore.Timestamp.now(),
      ttl: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
    });
  }

  await batch.commit();
}
```

## 🧪 Testing Strategy

### Test Cases to Verify

```typescript
// Test 1: Microsoft search
const microsoftResults = await searchSponsorsAndCustodians('Microsoft');
// Expected: Microsoft Corporation → Fidelity/Vanguard

// Test 2: Custodian search still works
const fidelityResults = await searchSponsorsAndCustodians('Fidelity');
// Expected: Fidelity custodian results

// Test 3: Historical search (once we add 2020-2023)
const oldMicrosoftResults = await searchSponsorsAndCustodians('Microsoft');
// Expected: Microsoft results from multiple years

// Test 4: Performance test
const start = Date.now();
await searchSponsorsAndCustodians('Google');
const duration = Date.now() - start;
// Expected: < 500ms response time
```

### Widget Integration

**Update test page** to include sponsor search:

```html
<!-- apps/widget-demo/test.html -->
<div class="sponsor-search-tests">
  <h3>🏢 Sponsor Search Tests</h3>
  <button class="sponsor-search" data-query="Microsoft">Microsoft</button>
  <button class="sponsor-search" data-query="Google">Google</button>
  <button class="sponsor-search" data-query="Amazon">Amazon</button>
  <button class="sponsor-search" data-query="Apple">Apple</button>
</div>

<script>
document.querySelectorAll('.sponsor-search').forEach(button => {
  button.addEventListener('click', (e) => {
    const query = e.target.getAttribute('data-query');
    logEvent('SPONSOR_SEARCH', `Searching for employer: ${query}`);
    testSearch(query);
  });
});
</script>
```

## 📊 Success Metrics

### Before Implementation
- ❌ "Microsoft 1990" searches return 0 results
- ❌ Cross-dataset JOINs fail with location errors
- ✅ Custodian search works (36K records)

### After Implementation
- ✅ "Microsoft 1990" searches return sponsor → custodian results
- ✅ Single-dataset JOINs work reliably
- ✅ Combined sponsor + custodian search covers all use cases
- ✅ <500ms response times with proper caching
- ✅ Historical searches work across multiple years

## 🚀 Implementation Timeline

### Week 1: Data Migration
1. **Run migration script** to populate `dol_data.plan_sponsors`
2. **Verify ack_id mapping** between sponsors and custodians
3. **Test JOIN queries** ensure proper relationships

### Week 2: Search Enhancement
1. **Update search API** to query both sponsors and custodians
2. **Enhance cache warming** to include top employers
3. **Update widget test page** with sponsor search buttons

### Week 3: Historical Data
1. **Download DOL data 2020-2023**
2. **Ingest into same `dol_data` dataset** (following architecture rules)
3. **Verify Microsoft 1990s** scenarios work with historical data

## ⚠️ Critical Requirements

### Data Integrity
- ✅ All data in single `dol_data` dataset
- ✅ Preserve `ack_id` relationships
- ✅ Consistent partitioning by `form_tax_year`

### Performance
- ✅ Sub-500ms query response times
- ✅ Proper BigQuery clustering
- ✅ Firestore caching for popular searches

### Functionality
- ✅ Sponsor search: "Microsoft" → finds employer plans
- ✅ Custodian search: "Fidelity" → finds custodian services
- ✅ Combined results: Best match regardless of search type

---

**Implementation Priority**: HIGH - Required for "Microsoft 1990" employee search scenarios