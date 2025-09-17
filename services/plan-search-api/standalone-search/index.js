/**
 * Entry point for Cloud Functions Gen 2
 */

const functions = require('@google-cloud/functions-framework');

// Import the compiled TypeScript function
const { searchPlans } = require('./dist/index.js');

// Register the HTTP function with the Functions Framework
functions.http('searchPlans', searchPlans);

// Export for direct testing
exports.searchPlans = searchPlans;