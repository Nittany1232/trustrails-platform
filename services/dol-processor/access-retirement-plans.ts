/**
 * Direct access to retirement_plans.form5500_latest table
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'trustrails-faa3e';

async function accessRetirementPlans() {
  console.log('🔍 Direct access to retirement_plans.form5500_latest');
  console.log('='.repeat(60));

  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
  });

  try {
    // Try to get table schema first
    console.log('\n📊 Getting table schema...');

    const [metadata] = await bigquery
      .dataset('retirement_plans')
      .table('form5500_latest')
      .getMetadata();

    console.log('✅ Successfully accessed table metadata');
    console.log(`Rows: ${metadata.numRows || 'Unknown'}`);
    console.log(`Created: ${metadata.creationTime ? new Date(parseInt(metadata.creationTime)).toLocaleDateString() : 'Unknown'}`);

    console.log('\nColumns:');
    metadata.schema.fields.forEach((field: any) => {
      console.log(`  ${field.name}: ${field.type}`);
    });

    // Try a simple count query first
    console.log('\n📊 Testing basic queries...');

    const countQuery = `
      SELECT COUNT(*) as total_records
      FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\`
    `;

    const [countResults] = await bigquery.query({
      query: countQuery
    });

    console.log(`✅ Total records: ${countResults[0].total_records.toLocaleString()}`);

    // Try to sample a few records to see actual column names
    console.log('\n📝 Sample records...');

    const sampleQuery = `
      SELECT *
      FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\`
      LIMIT 2
    `;

    const [sampleResults] = await bigquery.query({
      query: sampleQuery
    });

    if (sampleResults.length > 0) {
      console.log('✅ Sample data:');
      sampleResults.forEach((record: any, i: number) => {
        console.log(`\nRecord ${i + 1}:`);
        Object.entries(record).slice(0, 10).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
        if (Object.keys(record).length > 10) {
          console.log(`  ... and ${Object.keys(record).length - 10} more columns`);
        }
      });

      // Look for sponsor-related columns
      const sponsorColumns = Object.keys(sampleResults[0]).filter(col =>
        col.toLowerCase().includes('sponsor') ||
        col.toLowerCase().includes('company') ||
        col.toLowerCase().includes('employer')
      );

      if (sponsorColumns.length > 0) {
        console.log('\n🏢 Sponsor-related columns found:');
        sponsorColumns.forEach(col => {
          console.log(`  ${col}: ${sampleResults[0][col]}`);
        });
      }

      // Look for ack_id column
      if (sampleResults[0].ack_id) {
        console.log(`\n🔗 ACK ID found: ${sampleResults[0].ack_id}`);

        // Test JOIN with schedule_c_custodians
        console.log('\n🔗 Testing JOIN with schedule_c_custodians...');

        const joinQuery = `
          SELECT
            f5.ack_id,
            cc.provider_other_name as custodian_name,
            COUNT(*) as records
          FROM \`${PROJECT_ID}.retirement_plans.form5500_latest\` f5
          JOIN \`${PROJECT_ID}.dol_data.schedule_c_custodians\` cc
            ON f5.ack_id = cc.ack_id
          GROUP BY f5.ack_id, cc.provider_other_name
          LIMIT 5
        `;

        const [joinResults] = await bigquery.query({
          query: joinQuery
        });

        if (joinResults.length > 0) {
          console.log(`🎉 JOIN successful! Found ${joinResults.length} matching records:`);
          joinResults.forEach((result: any) => {
            console.log(`  ACK ID: ${result.ack_id} → ${result.custodian_name} (${result.records} records)`);
          });

          console.log('\n💡 CONCLUSION:');
          console.log('✅ retirement_plans.form5500_latest is accessible');
          console.log('✅ Contains sponsor data');
          console.log('✅ Can JOIN with schedule_c_custodians via ack_id');
          console.log('🚀 NO additional tables needed - update search API to use JOIN');

        } else {
          console.log('⚠️ JOIN returned no results - data might not overlap');
        }
      } else {
        console.log('❌ No ack_id column found for joining');
      }

    } else {
      console.log('⚠️ No sample data returned');
    }

  } catch (error: any) {
    console.error('❌ Error accessing retirement_plans.form5500_latest:', error.message);

    if (error.message.includes('Not found')) {
      console.log('💡 Table or dataset might not exist in this project');
    } else if (error.message.includes('permission')) {
      console.log('💡 Permission issue - check dataset access');
    } else if (error.message.includes('location')) {
      console.log('💡 Location issue - table might be in different region');
    }
  }
}

// Run the access test
accessRetirementPlans().catch(console.error);