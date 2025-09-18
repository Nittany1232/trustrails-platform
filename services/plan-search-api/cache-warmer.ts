/**
 * Cache Warming Service for Top Custodians
 * Populates Firestore with frequently searched custodian data
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

/**
 * Generate search variations for a custodian name
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
  console.log('🔥 Starting cache warming process...');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Get top custodians from BigQuery
    console.log('\n📊 Querying top 100 custodians from BigQuery...');
    
    const query = `
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
    
    const [results] = await bigquery.query({ query, location: 'US' });
    console.log(`✅ Found ${results.length} top custodians`);
    
    // Step 2: Prepare batch write to Firestore
    console.log('\n📝 Preparing Firestore cache documents...');
    const batch = db.batch();
    const ttl = admin.firestore.Timestamp.fromMillis(
      Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    );
    
    for (const custodian of results) {
      const docId = sanitizeId(custodian.name);
      const docRef = db.collection('custodian_cache').doc(docId);
      
      const cacheData: CustodianCache = {
        name: custodian.name,
        ein: custodian.ein || null,
        planCount: custodian.planCount,
        marketShare: custodian.marketShare,
        searchTerms: generateSearchTerms(custodian.name),
        city: custodian.city || null,
        state: custodian.state || null,
        lastUpdated: admin.firestore.Timestamp.now(),
        ttl: ttl
      };
      
      batch.set(docRef, cacheData);
    }
    
    // Step 3: Commit to Firestore
    console.log('\n💾 Writing to Firestore...');
    await batch.commit();
    console.log('✅ Successfully cached top 100 custodians');
    
    // Step 4: Create popular employer cache
    console.log('\n🏢 Caching popular employer searches...');
    const popularEmployers = [
      { name: 'Microsoft Corporation', ein: '91-1144442', custodian: 'Fidelity' },
      { name: 'Amazon.com Inc', ein: '91-1646860', custodian: 'Vanguard' },
      { name: 'Google LLC', ein: '77-0493581', custodian: 'Vanguard' },
      { name: 'Apple Inc', ein: '94-2404110', custodian: 'Multiple' },
      { name: 'Meta Platforms Inc', ein: '20-1665019', custodian: 'Fidelity' }
    ];
    
    const employerBatch = db.batch();
    for (const employer of popularEmployers) {
      const docRef = db.collection('employer_cache').doc(sanitizeId(employer.name));
      employerBatch.set(docRef, {
        ...employer,
        searchTerms: generateSearchTerms(employer.name),
        lastUpdated: admin.firestore.Timestamp.now(),
        ttl: ttl
      });
    }
    await employerBatch.commit();
    console.log('✅ Cached popular employers');
    
    // Step 5: Display summary
    console.log('\n📈 Cache Warming Summary:');
    console.log('='.repeat(60));
    console.log(`Top 5 Custodians by Market Share:`);
    results.slice(0, 5).forEach((c: any, i: number) => {
      console.log(`${i + 1}. ${c.name}: ${c.marketShare}% (${c.planCount} plans)`);
    });
    
    console.log('\n✨ Cache warming complete!');
    console.log('🚀 Searches for these custodians will now be lightning fast!');
    
  } catch (error) {
    console.error('❌ Cache warming failed:', error);
    throw error;
  }
}

// Run cache warming
warmCache()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });