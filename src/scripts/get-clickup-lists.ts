
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const CLICKUP_API_TOKEN = envConfig.CLICKUP_API_TOKEN;

async function getLists() {
  if (!CLICKUP_API_TOKEN) {
    console.error('Error: CLICKUP_API_TOKEN not found in .env.local');
    return;
  }

  console.log('Fetching ClickUp Teams (Workspaces)...');
  
  try {
    // 1. Get Teams (Workspaces)
    const teamsResp = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { 'Authorization': CLICKUP_API_TOKEN }
    });
    const teamsData = await teamsResp.json();
    
    if (!teamsData.teams || teamsData.teams.length === 0) {
      console.log('No teams found.');
      return;
    }

    for (const team of teamsData.teams) {
      console.log(`\nWorkspace: ${team.name} (ID: ${team.id})`);
      
      // 2. Get Spaces for each Team
      const spacesResp = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/space?archived=false`, {
        headers: { 'Authorization': CLICKUP_API_TOKEN }
      });
      const spacesData = await spacesResp.json();

      for (const space of spacesData.spaces) {
        console.log(`  Space: ${space.name} (ID: ${space.id})`);

        // 3. Get Folders for each Space
        const foldersResp = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder?archived=false`, {
          headers: { 'Authorization': CLICKUP_API_TOKEN }
        });
        const foldersData = await foldersResp.json();

        // 4. Get Lists in Folders
        for (const folder of foldersData.folders) {
          console.log(`    Folder: ${folder.name} (ID: ${folder.id})`);
          for (const list of folder.lists) {
            console.log(`      - List: ${list.name} (ID: ${list.id})`);
          }
        }

        // 5. Get Folderless Lists in Space
        const listsResp = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`, {
          headers: { 'Authorization': CLICKUP_API_TOKEN }
        });
        const listsData = await listsResp.json();
        
        for (const list of listsData.lists) {
          console.log(`    - List: ${list.name} (ID: ${list.id})`);
        }
      }
    }

  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

getLists();
