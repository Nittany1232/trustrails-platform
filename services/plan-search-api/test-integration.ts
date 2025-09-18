/**
 * Integration test for the enhanced search API with Schedule C data
 */

import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:8081';

// Test cases for different search scenarios
const testCases = [
  {
    name: 'Search by company name (should find recordkeeper)',
    params: { q: 'AMAZON' },
    expected: {
      hasResults: true,
      checkForContact: true
    }
  },
  {
    name: 'Search by EIN',
    params: { ein: '911646860' }, // Amazon's EIN
    expected: {
      hasResults: true,
      checkForContact: true
    }
  },
  {
    name: 'Search by state',
    params: { state: 'WA', limit: '5' },
    expected: {
      hasResults: true,
      checkForContact: true
    }
  },
  {
    name: 'Search with multiple filters',
    params: { state: 'CA', q: 'GOOGLE' },
    expected: {
      hasResults: true,
      checkForContact: true
    }
  }
];

async function runTest(testCase: any) {
  console.log(`\n📊 Testing: ${testCase.name}`);
  console.log('Parameters:', testCase.params);

  try {
    // Build query string
    const queryString = new URLSearchParams(testCase.params).toString();
    const url = `${API_URL}?${queryString}`;

    console.log('URL:', url);

    // Make request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Validate response
    if (testCase.expected.hasResults) {
      if (!data.success || !data.results || data.results.length === 0) {
        console.error('❌ Expected results but got none');
        return false;
      }
      console.log(`✅ Found ${data.results.length} results`);
    }

    // Check for contact information
    if (testCase.expected.checkForContact && data.results) {
      let contactStats = {
        withContact: 0,
        withoutContact: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0
      };

      data.results.forEach((result: any) => {
        if (result.primaryContact) {
          contactStats.withContact++;

          // Track confidence levels
          if (result.contactConfidence === 'high') {
            contactStats.highConfidence++;
          } else if (result.contactConfidence === 'medium') {
            contactStats.mediumConfidence++;
          } else {
            contactStats.lowConfidence++;
          }

          // Display first contact found
          if (contactStats.withContact === 1) {
            console.log('\n📞 Sample Primary Contact:');
            console.log(`  Name: ${result.primaryContact.name}`);
            console.log(`  EIN: ${result.primaryContact.ein}`);
            console.log(`  Relation: ${result.primaryContact.relation}`);
            console.log(`  Confidence: ${result.contactConfidence}`);
            console.log(`  Guidance: ${result.contactGuidance}`);
          }
        } else {
          contactStats.withoutContact++;
        }
      });

      console.log('\n📈 Contact Statistics:');
      console.log(`  Plans with contact: ${contactStats.withContact}`);
      console.log(`  Plans without contact: ${contactStats.withoutContact}`);
      if (contactStats.withContact > 0) {
        console.log(`  High confidence: ${contactStats.highConfidence}`);
        console.log(`  Medium confidence: ${contactStats.mediumConfidence}`);
        console.log(`  Low confidence: ${contactStats.lowConfidence}`);
      }
    }

    // Show search metadata
    if (data.metadata) {
      console.log('\n🔍 Search Metadata:');
      console.log(`  Method: ${data.metadata.searchMethod}`);
      console.log(`  Cached: ${data.metadata.cached}`);
      console.log(`  Processing Time: ${data.metadata.processingTime}`);
    }

    return true;

  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Integration Tests for Enhanced Search API');
  console.log('=' .repeat(60));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success Rate: ${(passed / testCases.length * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! The integration is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the errors above.');
  }
}

// Run tests
runAllTests().catch(console.error);