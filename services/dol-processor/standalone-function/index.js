/**
 * Entry point for Cloud Functions Gen 2
 * This file wraps our TypeScript function for proper deployment
 */

const functions = require('@google-cloud/functions-framework');

// Import the compiled TypeScript function
const { syncDOLData } = require('./dist/index.js');

// Register the HTTP function with the Functions Framework
functions.http('syncDOLData', syncDOLData);

// Export for direct testing
exports.syncDOLData = syncDOLData;