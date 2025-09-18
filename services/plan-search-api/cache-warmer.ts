/**
 * Enhanced Cache Warming Service for Sponsor-Custodian Mapping
 * Populates Firestore with sponsor-custodian relationships and top searched data
 * Optimized for "Microsoft 1990" employee search scenarios
 */

import { BigQuery } from '@google-cloud/bigquery';
import * as admin from 'firebase-admin';

const serviceAccount = require('/home/stock1232/projects/trustrails/credentials/firebase-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'trustrails-faa3e'
});

const db = admin.firestore();
const bigquery = new BigQuery({
  projectId: 'trustrails-faa3e',
  keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
});

interface CustodianCache {
  name: string;
  ein: string | null;
  planCount: number;
  marketShare: number;
  searchTerms: string[];
  city: string | null;
  state: string | null;
  lastUpdated: FirebaseFirestore.Timestamp;
  ttl: FirebaseFirestore.Timestamp;
}

interface SponsorCache {
  name: string;
  ein: string;
  planCount: number;
  totalParticipants: number;
  totalAssets: number;
  primaryCustodians: string[];
  searchTerms: string[];
  city: string | null;
  state: string | null;
  confidence: number;
  lastUpdated: FirebaseFirestore.Timestamp;
  ttl: FirebaseFirestore.Timestamp;
}

/**
 * Generate search variations for a custodian name (legacy function)
 */
function generateSearchTerms(name: string): string[] {
  const terms = new Set<string>();
  const normalized = name.toLowerCase();
  
  // Full name
  terms.add(normalized);
  
  // Common variations
  if (normalized.includes('fidelity')) {
    terms.add('fidelity');
    terms.add('fid');
    terms.add('fidelity investments');
  }
  if (normalized.includes('vanguard')) {
    terms.add('vanguard');
    terms.add('vanguard group');
  }
  if (normalized.includes('empower')) {
    terms.add('empower');
    terms.add('empower retirement');
  }
  if (normalized.includes('principal')) {
    terms.add('principal');
    terms.add('principal life');
  }
  if (normalized.includes('schwab')) {
    terms.add('schwab');
    terms.add('charles schwab');
  }
  
  // First word (common shorthand)
  const firstWord = normalized.split(' ')[0];
  if (firstWord.length > 3) {
    terms.add(firstWord);
  }
  
  return Array.from(terms);
}

/**
 * Sanitize name for Firestore document ID
 */
function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}

async function warmCache() {
  console.log('🔥 Starting Enhanced Cache Warming Process...');
  console.log('Goal: Enable <500ms responses for sponsor-custodian searches');
  console.log('='.repeat(70));

  try {
    // Step 1: Warm sponsor cache with top employers
    await warmSponsorCache();

    // Step 2: Warm custodian cache (existing functionality)
    await warmCustodianCache();

    // Step 3: Create sponsor-custodian relationship cache
    await warmSponsorCustodianRelationships();

    console.log('\n🎉 Enhanced cache warming complete!');
    console.log('✅ Sponsor searches: Ready');
    console.log('✅ Custodian searches: Ready');
    console.log('✅ Sponsor-custodian relationships: Ready');

  } catch (error) {
    console.error('❌ Cache warming failed:', error);
    throw error;
  }
}

/**
 * Warm sponsor cache with top employers and their custodian relationships
 */
async function warmSponsorCache() {
  console.log('\n📊 Step 1: Warming Sponsor Cache...');
  console.log('-'.repeat(50));

  const sponsorQuery = `
    WITH sponsor_summary AS (
      SELECT
        ps.sponsor_name,
        ps.ein_plan_sponsor,
        COUNT(*) as plan_count,
        SUM(COALESCE(ps.participants, 0)) as total_participants,
        SUM(COALESCE(ps.total_assets, 0)) as total_assets,
        ARRAY_AGG(DISTINCT cc.provider_other_name IGNORE NULLS LIMIT 5) as custodians,
        ANY_VALUE(ps.sponsor_city) as city,
        ANY_VALUE(ps.sponsor_state) as state,
        AVG(ps.confidence_score) as avg_confidence
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
      LEFT JOIN \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
        ON ps.ack_id = cc.ack_id
      WHERE ps.sponsor_name IS NOT NULL
        AND LENGTH(ps.sponsor_name) > 3
        AND ps.sponsor_name NOT LIKE '%TEST%'
        AND ps.sponsor_name NOT LIKE '%DUMMY%'
      GROUP BY ps.sponsor_name, ps.ein_plan_sponsor
      HAVING plan_count >= 1  -- At least 1 plan
    )
    SELECT *
    FROM sponsor_summary
    ORDER BY total_participants DESC, total_assets DESC
    LIMIT 500  -- Top 500 sponsors by participants
  `;

  const [sponsorResults] = await bigquery.query({ query: sponsorQuery, location: 'US' });
  console.log(`✅ Found ${sponsorResults.length} top sponsors`);

  // Batch write sponsor cache
  const batch = db.batch();
  const ttl = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  for (const sponsor of sponsorResults) {
    const docId = sanitizeId(`${sponsor.sponsor_name}_${sponsor.ein_plan_sponsor}`);
    const docRef = db.collection('sponsor_cache').doc(docId);

    const cacheData: SponsorCache = {
      name: sponsor.sponsor_name,
      ein: sponsor.ein_plan_sponsor,
      planCount: sponsor.plan_count,
      totalParticipants: sponsor.total_participants || 0,
      totalAssets: sponsor.total_assets || 0,
      primaryCustodians: sponsor.custodians || [],
      searchTerms: generateSponsorSearchTerms(sponsor.sponsor_name),
      city: sponsor.city,
      state: sponsor.state,
      confidence: sponsor.avg_confidence || 1.0,
      lastUpdated: admin.firestore.Timestamp.now(),
      ttl: ttl
    };

    batch.set(docRef, cacheData);
  }

  await batch.commit();
  console.log(`✅ Cached ${sponsorResults.length} sponsors`);

  // Show top sponsors
  console.log('\n🏆 Top 5 Sponsors by Participants:');
  sponsorResults.slice(0, 5).forEach((s: any, i: number) => {
    console.log(`${i + 1}. ${s.sponsor_name}`);
    console.log(`   Participants: ${s.total_participants?.toLocaleString()}`);
    console.log(`   Custodians: ${(s.custodians || []).join(', ')}`);
  });
}

/**
 * Generate search terms for sponsor names
 */
function generateSponsorSearchTerms(name: string): string[] {
  const terms = new Set<string>();
  const normalized = name.toLowerCase();

  // Full name
  terms.add(normalized);

  // Remove common corporate suffixes for better matching
  const withoutSuffixes = normalized
    .replace(/\s+(inc|llc|corp|corporation|company|co|ltd|limited)\s*$/i, '')
    .trim();
  if (withoutSuffixes !== normalized) {
    terms.add(withoutSuffixes);
  }

  // Common tech company variations
  if (normalized.includes('microsoft')) {
    terms.add('microsoft');
    terms.add('msft');
    terms.add('microsoft corporation');
  }
  if (normalized.includes('google')) {
    terms.add('google');
    terms.add('alphabet');
    terms.add('google llc');
  }
  if (normalized.includes('amazon')) {
    terms.add('amazon');
    terms.add('amzn');
    terms.add('amazon.com');
  }
  if (normalized.includes('apple')) {
    terms.add('apple');
    terms.add('apple inc');
    terms.add('aapl');
  }
  if (normalized.includes('meta') || normalized.includes('facebook')) {
    terms.add('meta');
    terms.add('facebook');
    terms.add('meta platforms');
  }

  // First significant word (usually company name)
  const words = normalized.split(/\s+/);
  if (words.length > 0 && words[0].length >= 3) {
    terms.add(words[0]);
  }

  return Array.from(terms);
}

/**
 * Warm custodian cache (existing functionality enhanced)
 */
async function warmCustodianCache() {
  console.log('\n📊 Step 2: Warming Custodian Cache...');
  console.log('-'.repeat(50));
    
  const custodianQuery = `
    SELECT
      provider_other_name as name,
      ANY_VALUE(provider_other_ein) as ein,
      ANY_VALUE(provider_other_us_city) as city,
      ANY_VALUE(provider_other_us_state) as state,
      COUNT(*) as planCount,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`), 2) as marketShare
    FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
    WHERE provider_other_name IS NOT NULL
    GROUP BY provider_other_name
    ORDER BY planCount DESC
    LIMIT 100
  `;
    
  const [custodianResults] = await bigquery.query({ query: custodianQuery, location: 'US' });
  console.log(`✅ Found ${custodianResults.length} top custodians`);

  // Prepare batch write to Firestore
  const custodianBatch = db.batch();
  const ttl = admin.firestore.Timestamp.fromMillis(
    Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  );
    
  for (const custodian of custodianResults) {
    const docId = sanitizeId(custodian.name);
    const docRef = db.collection('custodian_cache').doc(docId);

    const cacheData: CustodianCache = {
      name: custodian.name,
      ein: custodian.ein || null,
      planCount: custodian.planCount,
      marketShare: custodian.marketShare,
      searchTerms: generateCustodianSearchTerms(custodian.name),
      city: custodian.city || null,
      state: custodian.state || null,
      lastUpdated: admin.firestore.Timestamp.now(),
      ttl: ttl
    };

    custodianBatch.set(docRef, cacheData);
  }

  await custodianBatch.commit();
  console.log('✅ Successfully cached top 100 custodians');

  console.log('\n🏆 Top 5 Custodians by Market Share:');
  custodianResults.slice(0, 5).forEach((c: any, i: number) => {
    console.log(`${i + 1}. ${c.name}: ${c.marketShare}% (${c.planCount} plans)`);
  });
}

/**
 * Create sponsor-custodian relationship cache for fast lookups
 */
async function warmSponsorCustodianRelationships() {
  console.log('\n🔗 Step 3: Warming Sponsor-Custodian Relationships...');
  console.log('-'.repeat(50));

  const relationshipQuery = `
    SELECT
      ps.sponsor_name,
      ps.ein_plan_sponsor,
      ARRAY_AGG(
        STRUCT(
          cc.provider_other_name as custodian_name,
          cc.provider_other_relation as relation,
          CASE
            WHEN UPPER(cc.provider_other_relation) LIKE '%RECORDKEEP%' THEN 1
            WHEN UPPER(cc.provider_other_relation) IN ('ADMIN', 'ADMINISTRATOR') THEN 2
            WHEN UPPER(cc.provider_other_relation) IN ('TRUSTEE', 'CUSTODIAN') THEN 3
            ELSE 4
          END as priority
        )
        ORDER BY
          CASE
            WHEN UPPER(cc.provider_other_relation) LIKE '%RECORDKEEP%' THEN 1
            WHEN UPPER(cc.provider_other_relation) IN ('ADMIN', 'ADMINISTRATOR') THEN 2
            WHEN UPPER(cc.provider_other_relation) IN ('TRUSTEE', 'CUSTODIAN') THEN 3
            ELSE 4
          END
        LIMIT 3
      ) as custodian_relationships
    FROM \`trustrails-faa3e.dol_data.plan_sponsors\` ps
    JOIN \`trustrails-faa3e.dol_data.schedule_c_custodians\` cc
      ON ps.ack_id = cc.ack_id
    WHERE ps.sponsor_name IS NOT NULL
      AND cc.provider_other_name IS NOT NULL
    GROUP BY ps.sponsor_name, ps.ein_plan_sponsor
    HAVING ARRAY_LENGTH(custodian_relationships) > 0
    LIMIT 1000  -- Top 1000 sponsor-custodian relationships
  `;

  const [relationshipResults] = await bigquery.query({ query: relationshipQuery, location: 'US' });
  console.log(`✅ Found ${relationshipResults.length} sponsor-custodian relationships`);

  // Cache relationships
  const relationshipBatch = db.batch();
  const ttl = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  for (const relationship of relationshipResults) {
    const docId = sanitizeId(`${relationship.sponsor_name}_${relationship.ein_plan_sponsor}`);
    const docRef = db.collection('sponsor_custodian_relationships').doc(docId);

    relationshipBatch.set(docRef, {
      sponsorName: relationship.sponsor_name,
      sponsorEin: relationship.ein_plan_sponsor,
      custodianRelationships: relationship.custodian_relationships,
      searchTerms: generateSponsorSearchTerms(relationship.sponsor_name),
      lastUpdated: admin.firestore.Timestamp.now(),
      ttl: ttl
    });
  }

  await relationshipBatch.commit();
  console.log('✅ Cached sponsor-custodian relationships');
}
    
}

/**
 * Rename existing function for custodian search terms
 */
function generateCustodianSearchTerms(name: string): string[] {
  return generateSearchTerms(name);
}

// Run cache warming
warmCache()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });