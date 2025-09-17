const admin = require('firebase-admin');
const creds = require('./credentials/firebase-admin.json');

admin.initializeApp({ credential: admin.credential.cert(creds) });
const db = admin.firestore();

async function check() {
  // Check Empower by UUID
  const empowerDoc = await db.collection('custodians').doc('ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8').get();

  if (empowerDoc.exists) {
    const data = empowerDoc.data();
    console.log('Found Empower custodian:', empowerDoc.id);
    console.log('- name:', data.name);
    console.log('- partnerId:', data.partnerId || 'NOT SET');
    console.log('- api_keys field exists:', Boolean(data.api_keys));
    console.log('- integrationConfig field exists:', Boolean(data.integrationConfig));
    console.log('- widgetEnabled:', data.widgetEnabled);
    console.log('- status:', data.status);

    if (data.api_keys) {
      console.log('\nAPI keys in api_keys field:', data.api_keys.length);
      data.api_keys.forEach((key, i) => {
        console.log(`  Key ${i+1}:`, {
          id: key.id,
          type: key.type,
          status: key.status,
          prefix: key.prefix || 'no prefix',
          hashedKey: key.hashedKey ? key.hashedKey.substring(0, 20) + '...' : 'missing'
        });
        // Check if this matches our test key
        if (key.prefix === 'tr_test_pk_fTeq') {
          console.log('    ^^ This might be our test key!');
        }
      });
    }

    if (data.integrationConfig && data.integrationConfig.apiKeys) {
      console.log('\nAPI keys in integrationConfig.apiKeys:', data.integrationConfig.apiKeys.length);
      data.integrationConfig.apiKeys.forEach((key, i) => {
        console.log(`  Key ${i+1}:`, {
          id: key.id,
          type: key.type,
          status: key.status,
          hashedKey: key.hashedKey ? key.hashedKey.substring(0, 20) + '...' : 'missing'
        });
      });
    }
  } else {
    console.log('Empower document not found');
  }
}

check().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});