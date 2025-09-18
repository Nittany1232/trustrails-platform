#!/usr/bin/env python3
import json
import os
import re

agents_dir = "/home/stock1232/projects/trustrails-platform/.claude/agents"
settings_file = "/home/stock1232/projects/trustrails-platform/.claude/settings.local.json"

# Read current settings
with open(settings_file, 'r') as f:
    settings = json.load(f)

# Process each agent markdown file
for filename in os.listdir(agents_dir):
    if filename.endswith('.md'):
        agent_id = filename.replace('.md', '')
        filepath = os.path.join(agents_dir, filename)

        with open(filepath, 'r') as f:
            content = f.read()

        # Parse the frontmatter
        frontmatter_match = re.match(r'^---\n(.*?)\n---\n(.*)', content, re.DOTALL)
        if frontmatter_match:
            frontmatter = frontmatter_match.group(1)
            body = frontmatter_match.group(2).strip()

            # Parse frontmatter fields
            name_match = re.search(r'^name:\s*(.+)$', frontmatter, re.MULTILINE)
            desc_match = re.search(r'^description:\s*(.+)$', frontmatter, re.MULTILINE)

            if name_match and desc_match:
                name = name_match.group(1).strip()
                description = desc_match.group(1).strip()

                # Update or add agent to settings
                if 'agents' not in settings:
                    settings['agents'] = {}

                settings['agents'][agent_id] = {
                    "name": name,
                    "description": description,
                    "systemPrompt": body
                }
                print(f"Updated agent: {agent_id}")

# Write updated settings
with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=2)

print(f"\n✅ Successfully updated {len(settings.get('agents', {}))} agents in settings.local.json")