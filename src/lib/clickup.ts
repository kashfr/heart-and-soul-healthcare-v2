export interface ClickUpTaskData {
  name: string;
  description?: string;
  markdown_description?: string;
  status?: string;
  priority?: number; // 1 = Urgent, 2 = High, 3 = Normal, 4 = Low
  due_date?: number; // Unix timestamp in milliseconds
  notify_all?: boolean;
  custom_fields?: Array<{
    id: string;
    value: any;
  }>;
}

export async function createClickUpTask(listId: string, data: ClickUpTaskData) {
  const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;

  if (!CLICKUP_API_TOKEN) {
    console.warn('ClickUp API Token not found. Skipping task creation.');
    return null;
  }

  if (!listId) {
    console.warn('ClickUp List ID not provided. Skipping task creation.');
    return null;
  }

  try {
    const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': CLICKUP_API_TOKEN
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('ClickUp API Error:', errorData);
      throw new Error(`Failed to create ClickUp task: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Successfully created ClickUp task: ${result.id}`);
    return result;
  } catch (error) {
    console.error('Error creating ClickUp task:', error);
    // We intentionally don't throw here to avoid failing the whole form submission 
    // if just the ClickUp integration fails.
    return null;
  }
}
