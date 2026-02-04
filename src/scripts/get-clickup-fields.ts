
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const CLICKUP_API_TOKEN = envConfig.CLICKUP_API_TOKEN;
const LIST_ID = process.argv[2] || envConfig.CLICKUP_CONTACT_LIST_ID;

if (!LIST_ID) {
  console.error('Error: List ID not found. Pass it as an argument or set CLICKUP_CONTACT_LIST_ID in .env.local');
  process.exit(1);
} // Focusing on Website Inquiries list first

async function getCustomFields() {
  if (!CLICKUP_API_TOKEN || !LIST_ID) {
    console.error('Error: Missing Token or List ID');
    return;
  }

  console.log(`Fetching Custom Fields for List ID: ${LIST_ID}`);
  
  try {
    const response = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/field`, {
      headers: { 'Authorization': CLICKUP_API_TOKEN }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch fields:', await response.text());
      return;
    }

    const data = await response.json();
    console.log('\nAvailable Custom Fields:');
    data.fields.forEach((field: any) => {
      console.log(`- Name: "${field.name}"`);
      console.log(`  ID:   "${field.id}"`);
      console.log(`  Type: "${field.type}"\n`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

getCustomFields();
