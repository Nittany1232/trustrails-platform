/**
 * Test custodian filtering functionality
 * Tests the new custodian parameter in the search API
 */

const API_ENDPOINT = 'http://localhost:8081';

async function testCustodianFiltering() {
  console.log('🧪 Testing Custodian Filtering Functionality');
  console.log('=' .repeat(50));

  // Test 1: Search Microsoft without custodian filter
  console.log('\n1. Testing Microsoft search WITHOUT custodian filter:');
  try {
    const response1 = await fetch(
      `${API_ENDPOINT}/searchPlans?q=Microsoft&limit=5&force_bigquery=true`
    );
    const data1 = await response1.json();

    console.log(`   ✅ Found ${data1.results?.length || 0} results`);
    console.log(`   📊 Total: ${data1.pagination?.total || 0}`);
    console.log(`   🔍 Method: ${data1.metadata?.searchMethod}`);
    console.log(`   🏦 Custodian filter: ${data1.metadata?.custodianFilter || 'none'}`);

    if (data1.results?.length > 0) {
      console.log(`   📝 First result: ${data1.results[0].company?.name} - ${data1.results[0].planName}`);
      console.log(`   🏢 Custodian: ${data1.results[0].primaryContact?.name || 'unknown'}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 2: Search Microsoft WITH Fidelity custodian filter
  console.log('\n2. Testing Microsoft search WITH Fidelity custodian filter:');
  try {
    const response2 = await fetch(
      `${API_ENDPOINT}/searchPlans?q=Microsoft&custodian=Fidelity&limit=5&force_bigquery=true`
    );
    const data2 = await response2.json();

    console.log(`   ✅ Found ${data2.results?.length || 0} results`);
    console.log(`   📊 Total: ${data2.pagination?.total || 0}`);
    console.log(`   🔍 Method: ${data2.metadata?.searchMethod}`);
    console.log(`   🏦 Custodian filter: ${data2.metadata?.custodianFilter || 'none'}`);

    if (data2.results?.length > 0) {
      console.log(`   📝 First result: ${data2.results[0].company?.name} - ${data2.results[0].planName}`);
      console.log(`   🏢 Custodian: ${data2.results[0].primaryContact?.name || 'unknown'}`);

      // Verify all results are Fidelity-managed
      const allFidelity = data2.results.every(r =>
        r.primaryContact?.name?.toLowerCase().includes('fidelity')
      );
      console.log(`   ✅ All results from Fidelity: ${allFidelity ? 'YES' : 'NO'}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 3: Search ONLY by custodian (no company name)
  console.log('\n3. Testing search by Fidelity custodian ONLY:');
  try {
    const response3 = await fetch(
      `${API_ENDPOINT}/searchPlans?custodian=Fidelity&limit=10&force_bigquery=true`
    );
    const data3 = await response3.json();

    console.log(`   ✅ Found ${data3.results?.length || 0} results`);
    console.log(`   📊 Total: ${data3.pagination?.total || 0}`);
    console.log(`   🔍 Method: ${data3.metadata?.searchMethod}`);
    console.log(`   🏦 Custodian filter: ${data3.metadata?.custodianFilter || 'none'}`);

    if (data3.results?.length > 0) {
      console.log(`   📝 Sample companies:`);
      data3.results.slice(0, 3).forEach((result, i) => {
        console.log(`      ${i + 1}. ${result.company?.name} - ${result.primaryContact?.name || 'unknown'}`);
      });

      // Verify all results are Fidelity-managed
      const allFidelity = data3.results.every(r =>
        r.primaryContact?.name?.toLowerCase().includes('fidelity')
      );
      console.log(`   ✅ All results from Fidelity: ${allFidelity ? 'YES' : 'NO'}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 4: Test case insensitive matching
  console.log('\n4. Testing case-insensitive custodian matching:');
  try {
    const response4 = await fetch(
      `${API_ENDPOINT}/searchPlans?custodian=fidelity&limit=3&force_bigquery=true`
    );
    const data4 = await response4.json();

    console.log(`   ✅ Found ${data4.results?.length || 0} results`);
    console.log(`   📊 Total: ${data4.pagination?.total || 0}`);
    console.log(`   🏦 Custodian filter: ${data4.metadata?.custodianFilter || 'none'}`);

    if (data4.results?.length > 0) {
      console.log(`   ✅ Case insensitive search works!`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 5: Test with different custodians
  console.log('\n5. Testing different custodians:');
  const testCustodians = ['Vanguard', 'Empower', 'Principal'];

  for (const custodian of testCustodians) {
    try {
      const response = await fetch(
        `${API_ENDPOINT}/searchPlans?custodian=${encodeURIComponent(custodian)}&limit=2&force_bigquery=true`
      );
      const data = await response.json();

      console.log(`   ${custodian}: ${data.pagination?.total || 0} plans`);
    } catch (error) {
      console.log(`   ${custodian}: Error - ${error.message}`);
    }
  }

  console.log('\n✅ Custodian filtering tests completed!');
  console.log('\n💡 Expected behavior:');
  console.log('   - Without custodian filter: Returns all matching plans');
  console.log('   - With custodian filter: Returns only plans managed by that custodian');
  console.log('   - Case insensitive matching should work');
  console.log('   - Different custodians should return different plan counts');
}

// Run the test if this script is executed directly
if (require.main === module) {
  testCustodianFiltering().catch(console.error);
}

module.exports = { testCustodianFiltering };