/**
 * Local Search Server with BigQuery Custodian Support
 * Simple Express server for testing custodian search locally
 */

const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');

const app = express();
const PORT = 8082;

// Initialize BigQuery client
const bigquery = new BigQuery({
  projectId: 'trustrails-faa3e',
  keyFilename: '/home/stock1232/projects/trustrails/credentials/firebase-admin.json'
});

// Enable CORS for widget
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'local-search-server' });
});

// Search endpoint
app.get('/', async (req, res) => {
  try {
    const { q, limit = '20', offset = '0' } = req.query;
    
    if (!q) {
      return res.status(400).json({
        error: 'Query parameter "q" is required'
      });
    }

    console.log(`🔍 Searching for: "${q}"`);

    // Search custodians in BigQuery
    const sqlQuery = `
      SELECT DISTINCT
        provider_other_name as custodianName,
        provider_other_ein as ein,
        provider_other_us_city as city,
        provider_other_us_state as state,
        COUNT(*) as planCount,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`), 2) as marketShare
      FROM \`trustrails-faa3e.dol_data.schedule_c_custodians\`
      WHERE UPPER(provider_other_name) LIKE UPPER(@query)
      GROUP BY provider_other_name, provider_other_ein, provider_other_us_city, provider_other_us_state
      ORDER BY planCount DESC
      LIMIT @limit
    `;

    const options = {
      query: sqlQuery,
      params: {
        query: `%${q}%`,
        limit: parseInt(limit)
      },
      location: 'US'
    };

    const [results] = await bigquery.query(options);

    // Format results for widget
    const formattedResults = results.map((custodian) => ({
      ein: custodian.ein || 'N/A',
      planNumber: '000',
      planName: `${custodian.custodianName} - Custodian/Administrator`,
      company: {
        name: custodian.custodianName,
        city: custodian.city || '',
        state: custodian.state || '',
        zip: ''
      },
      planDetails: {
        type: 'Custodian Services',
        participants: custodian.planCount,
        assets: 0,
        assetFormatted: '$0'
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        searchRank: 100,
        marketShare: custodian.marketShare
      }
    }));

    console.log(`✅ Found ${results.length} custodian results`);

    res.json({
      success: true,
      results: formattedResults,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: results.length,
        hasMore: false
      },
      metadata: {
        searchMethod: 'bigquery',
        cached: false,
        processingTime: '50ms'
      }
    });

  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Local search server running on http://localhost:${PORT}`);
  console.log('📊 Connected to BigQuery custodian data');
  console.log('🔍 Test with: http://localhost:8082/?q=fidelity');
});