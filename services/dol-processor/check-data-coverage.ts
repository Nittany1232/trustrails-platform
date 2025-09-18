import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: 'trustrails-faa3e',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
});

async function checkDataCoverage() {
  try {
    // Check what years we have
    const query = `
      SELECT
        form_tax_year,
        COUNT(*) as record_count,
        COUNT(DISTINCT ein_plan_sponsor) as unique_sponsors,
        SUM(participants) as total_participants
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\`
      GROUP BY form_tax_year
      ORDER BY form_tax_year DESC
    `;

    const [rows] = await bigquery.query({ query, location: 'US' });

    console.log('\n📊 Current DOL Data Coverage:');
    console.log('================================');
    rows.forEach(row => {
      console.log(`Year ${row.form_tax_year}: ${row.record_count.toLocaleString()} plans, ${row.unique_sponsors.toLocaleString()} sponsors, ${row.total_participants.toLocaleString()} participants`);
    });

    // Check sample of largest sponsors
    const topSponsorsQuery = `
      SELECT
        sponsor_name,
        ein_plan_sponsor,
        participants,
        total_assets
      FROM \`trustrails-faa3e.dol_data.plan_sponsors\`
      WHERE participants > 50000
      ORDER BY participants DESC
      LIMIT 10
    `;

    const [topSponsors] = await bigquery.query({ query: topSponsorsQuery, location: 'US' });

    console.log('\n🏢 Top Sponsors by Participants:');
    console.log('================================');
    topSponsors.forEach(sponsor => {
      console.log(`${sponsor.sponsor_name}: ${sponsor.participants.toLocaleString()} participants`);
    });

    // Check custodian data
    const custodianQuery = `
      SELECT
        COUNT(DISTINCT ack_id) as plans_with_custodians,
        COUNT(DISTINCT provider_other_ein) as unique_custodians
      FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
    `;

    const [custodianData] = await bigquery.query({ query: custodianQuery, location: 'US' });

    console.log('\n🏦 Custodian Data:');
    console.log('================================');
    console.log(`Plans with custodian data: ${custodianData[0].plans_with_custodians.toLocaleString()}`);
    console.log(`Unique custodians: ${custodianData[0].unique_custodians.toLocaleString()}`);

  } catch (error) {
    console.error('Error checking data coverage:', error);
  }
}

checkDataCoverage();