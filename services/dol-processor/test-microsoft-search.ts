/**
 * Test Microsoft Search in Current Data
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';
const DATASET_ID = 'dol_data';

async function testMicrosoftSearch() {
  console.log('🔍 Testing Microsoft Search in Current Data');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Search for Microsoft in plan names
    const planQuery = `
      SELECT 
        plan_name,
        provider_other_name as custodian,
        ein_plan_sponsor,
        form_tax_year
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      WHERE UPPER(plan_name) LIKE '%MICROSOFT%'
      ORDER BY form_tax_year DESC
      LIMIT 10
    `;

    const [planResults] = await bigquery.query({ query: planQuery, location: 'US' });
    
    console.log('\n🏢 Microsoft Plans Found:');
    if (planResults.length === 0) {
      console.log('⚠️ No Microsoft plans found in current 2024 data');
      console.log('This confirms we need historical data (2020-2023) for the "1990 Microsoft" scenario');
    } else {
      planResults.forEach((plan: any) => {
        console.log(`- ${plan.plan_name}`);
        console.log(`  Custodian: ${plan.custodian}`);
        console.log(`  EIN: ${plan.ein_plan_sponsor}`);
        console.log(`  Year: ${plan.form_tax_year}`);
        console.log('');
      });
    }

    // Search for other major tech companies in 2024 data
    console.log('\n📊 Major Tech Companies in 2024 Data:');
    const techQuery = `
      SELECT 
        CASE 
          WHEN UPPER(plan_name) LIKE '%GOOGLE%' THEN 'Google'
          WHEN UPPER(plan_name) LIKE '%AMAZON%' THEN 'Amazon'
          WHEN UPPER(plan_name) LIKE '%APPLE%' THEN 'Apple'
          WHEN UPPER(plan_name) LIKE '%META%' OR UPPER(plan_name) LIKE '%FACEBOOK%' THEN 'Meta/Facebook'
          WHEN UPPER(plan_name) LIKE '%TESLA%' THEN 'Tesla'
          WHEN UPPER(plan_name) LIKE '%NETFLIX%' THEN 'Netflix'
        END as company,
        COUNT(*) as plan_count,
        ARRAY_AGG(DISTINCT provider_other_name IGNORE NULLS LIMIT 3) as custodians
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      WHERE UPPER(plan_name) LIKE '%GOOGLE%' 
         OR UPPER(plan_name) LIKE '%AMAZON%'
         OR UPPER(plan_name) LIKE '%APPLE%'
         OR UPPER(plan_name) LIKE '%META%'
         OR UPPER(plan_name) LIKE '%FACEBOOK%'
         OR UPPER(plan_name) LIKE '%TESLA%'
         OR UPPER(plan_name) LIKE '%NETFLIX%'
      GROUP BY company
      ORDER BY plan_count DESC
    `;

    const [techResults] = await bigquery.query({ query: techQuery, location: 'US' });
    
    if (techResults.length > 0) {
      techResults.forEach((company: any) => {
        console.log(`• ${company.company}: ${company.plan_count} plans`);
        console.log(`  Custodians: ${company.custodians.join(', ')}`);
      });
    } else {
      console.log('⚠️ No major tech companies found in plan names');
    }

    // Check if we can derive sponsor info from plan names
    console.log('\n📝 Plan Name Analysis (Sample):');
    const sampleQuery = `
      SELECT 
        plan_name,
        provider_other_name as custodian,
        -- Try to extract company name from plan name
        REGEXP_EXTRACT(plan_name, r'^([A-Z\\s&,\\.]+?)\\s+(401|403|RETIREMENT|PLAN)') as extracted_company
      FROM \`${PROJECT_ID}.${DATASET_ID}.schedule_c_custodians\`
      WHERE plan_name IS NOT NULL
        AND plan_name NOT LIKE '%FIDELITY%'
        AND plan_name NOT LIKE '%VANGUARD%'
        AND provider_other_name IN ('FIDELITY INVESTMENTS INSTITUTIONAL', 'EMPOWER ADVISORY GROUP, LLC')
      LIMIT 10
    `;

    const [sampleResults] = await bigquery.query({ query: sampleQuery, location: 'US' });
    
    sampleResults.forEach((sample: any) => {
      console.log(`Plan: ${sample.plan_name}`);
      console.log(`Extracted: ${sample.extracted_company || 'N/A'}`);
      console.log(`Custodian: ${sample.custodian}`);
      console.log('');
    });

    console.log('\n💡 Key Insights:');
    console.log('='.repeat(60));
    console.log('1. Current 2024 data may not include Microsoft (company evolution)');
    console.log('2. Need historical DOL data (2020-2023) for better coverage');
    console.log('3. Plan names contain sponsor info that we can extract');
    console.log('4. Should build sponsor cache alongside custodian cache');
    
    console.log('\n🛠️ Recommended Next Steps:');
    console.log('1. Download historical DOL Schedule C data (2020-2023)');
    console.log('2. Create sponsor extraction logic from plan names');
    console.log('3. Update cache warmer to include top employers');
    console.log('4. Modify search API to query both custodians AND sponsors');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the test
testMicrosoftSearch().catch(console.error);