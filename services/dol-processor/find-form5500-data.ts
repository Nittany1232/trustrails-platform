/**
 * Find the form5500_latest table in retirement_plans dataset
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function findForm5500Data() {
  console.log('🔍 Searching for form5500_latest table in all datasets');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // List all datasets
    const [datasets] = await bigquery.getDatasets();

    console.log(`Found ${datasets.length} datasets in project ${PROJECT_ID}:`);
    console.log('');

    for (const dataset of datasets) {
      console.log(`📊 Dataset: ${dataset.id}`);

      try {
        // List tables in each dataset
        const [tables] = await dataset.getTables();

        if (tables.length === 0) {
          console.log('   (no tables)');
        } else {
          for (const table of tables) {
            console.log(`   📋 Table: ${table.id}`);

            // Check if this is our form5500 table
            if (table.id.toLowerCase().includes('form5500') || table.id.toLowerCase().includes('latest')) {
              console.log(`   ⭐ FOUND POTENTIAL FORM5500 TABLE: ${dataset.id}.${table.id}`);

              // Get sample data
              try {
                const sampleQuery = `
                  SELECT *
                  FROM \`${PROJECT_ID}.${dataset.id}.${table.id}\`
                  LIMIT 2
                `;

                const [sampleResults] = await bigquery.query({ query: sampleQuery, location: 'US' });

                if (sampleResults.length > 0) {
                  console.log('   📝 Sample columns:');
                  Object.keys(sampleResults[0]).forEach(key => {
                    if (key.toLowerCase().includes('sponsor') || key.toLowerCase().includes('name') || key.toLowerCase().includes('plan') || key === 'ack_id') {
                      console.log(`     ${key}: ${sampleResults[0][key]}`);
                    }
                  });
                }
              } catch (err) {
                console.log(`   ❌ Error sampling data: ${err.message}`);
              }
            }
          }
        }
      } catch (err) {
        console.log(`   ❌ Error listing tables: ${err.message}`);
      }

      console.log('');
    }

    // Also try specific dataset name that was mentioned
    console.log('🔍 Checking specifically for retirement_plans dataset...');
    try {
      const retirementDataset = bigquery.dataset('retirement_plans');
      const [retirementTables] = await retirementDataset.getTables();

      console.log(`Found ${retirementTables.length} tables in retirement_plans dataset:`);
      retirementTables.forEach(table => {
        console.log(`   📋 ${table.id}`);
      });

      // Look for form5500_latest specifically
      const form5500Table = retirementTables.find(t => t.id === 'form5500_latest');
      if (form5500Table) {
        console.log('🎉 FOUND form5500_latest in retirement_plans dataset!');

        // Test JOIN with schedule_c_custodians
        const testJoinQuery = `
          SELECT
            f5.ack_id,
            f5.sponsor_dfe_name as sponsor_name,
            cc.provider_other_name as custodian_name,
            COUNT(*) as record_count
          FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` f5
          JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
            ON f5.ack_id = cc.ack_id
          WHERE f5.sponsor_dfe_name IS NOT NULL
            AND cc.provider_other_name IS NOT NULL
          GROUP BY f5.ack_id, f5.sponsor_dfe_name, cc.provider_other_name
          LIMIT 5
        `;

        const [joinResults] = await bigquery.query({ query: testJoinQuery, location: 'US' });

        if (joinResults.length > 0) {
          console.log('✅ JOIN between datasets works!');
          joinResults.forEach((result, i) => {
            console.log(`  ${i + 1}. ${result.sponsor_name} → ${result.custodian_name} (${result.record_count} records)`);
          });
        } else {
          console.log('⚠️ JOIN returns no results');
        }
      }

    } catch (err) {
      console.log(`❌ retirement_plans dataset not found: ${err.message}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the search
findForm5500Data().catch(console.error);