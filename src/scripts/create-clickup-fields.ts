
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const CLICKUP_API_TOKEN = envConfig.CLICKUP_API_TOKEN;
const LIST_ID = envConfig.CLICKUP_CONTACT_LIST_ID;

async function createField(name: string, type: string) {
  if (!CLICKUP_API_TOKEN || !LIST_ID) {
    console.error('Error: Missing Token or List ID');
    return;
  }

  console.log(`Creating field "${name}" (${type})...`);
  
  try {
    const response = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/field`, {
      method: 'POST',
      headers: { 
        'Authorization': CLICKUP_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type })
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to create field "${name}":`, text);
      return null;
    }

    const data = await response.json();
    console.log(`Success! Created "${name}" with ID: ${data.id}`);
    return data;

  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function main() {
  await createField('Contact Email', 'email');
  await createField('Subject', 'short_text');
}

main();
