# Discord Selfbot Roleplay

A Discord selfbot powered by OpenAI Agents SDK that enables AI-driven roleplay interactions. The bot uses OpenAI compatable API (or Azure OpenAI) to respond to messages with contextual awareness and custom personality.

## ⚠️ Disclaimer

**Using selfbots is against Discord's Terms of Service.** This project is for fun and educational purposes only. Use at your own risk. Your account may be banned if detected.

## Features

- 🤖 AI-powered responses using OpenAI Agents SDK
- 💬 Context-aware conversation with message history and user info
- 🔧 Extensible tool system for custom actions
- 🎭 Customizable personality via instruction templates
- 🔄 Support for both OpenAI and Azure OpenAI
- 📱 Relationship management tools (add/block/ignore users)

## What can AI see
The AI has access to the following information to generate context-aware responses:
- Recent message history (last 10 messages)
    - Author context
        - Author information (username, ID, display name, server nickname)
        - Author relationship with bot status (friend, blocked, ignored, pending, none)
        - Author current status (online, offline, idle, do not disturb)
        - Author activity (playing a game, streaming, etc.)
    - Message context
        - Current message id
        - Message content
        - Message attachments (file names and descriptions and content if image or supported file type)
        - Reply context (if the message is a reply)
            - Reply to message ID
            - Reply to message content of the replied message
            - Reply to message author information (username, ID, display name, server nickname)

## Prerequisites

- Node.js (v16 or higher)
- Discord account token
- OpenAI compatible API credentials or Azure OpenAI credentials

## Installation

1. Clone the repository:
```bash
git clone https://github.com/thedtvn/selfbot-roleplay.git
cd selfbot-roleplay
```

2. Install dependencies:
```bash
npm install
```
3. Edit Instructions in `configs/instructions.md` to customize the bot's personality to your liking.

4. Configure environment variables:
   - Copy `template.env` to `.env`
   - Fill in your credentials

## Usage With Docker

1. Build the Docker image:
```bash
docker build -t selfbot-roleplay .
```

2. Run the Docker container:
```bash
docker run --env-file .env -d --name selfbot-roleplay selfbot-roleplay
```
> Note: `-v $(pwd)/configs:/selfbot_roleplay/configs` can be added to mount to customize instructions without rebuilding the image.

## Usage With Out Docker

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Build TypeScript
```bash
npm run build
```
then run 
```bash
node .
```

## Existing Tools ( modify as needed )

- **add_friend**: Send or accept friend requests
- **add_blocked**: Block a user
- **add_ignored**: Ignore a user's messages
- **delete_ignored**: Remove a user from ignore list
- **delete_relationship**: Remove a friend or cancel a friend request / unblock a user

## How It Works

1. **Message Detection**: The bot listens for messages that mention it or are sent in DMs
2. **Context Collection**: Fetches the last 10 messages for conversation context
3. **AI Processing**: Sends the context to OpenAI Agents with system instructions
4. **Tool Execution**: AI can invoke tools (like adding friends, blocking users, etc.)
5. **Response**: Replies to the message with the AI-generated response

## Customization

### Personality Instructions

Edit `configs/instructions.md` to customize the bot's personality, background, and behavior. The template uses Mustache syntax for dynamic variables:

- `{{ user_id }}` - Current Account ID
- `{{ username }}` - Current Account username
- `{{ user_global_name }}` - Current Account display name
- `{{ current_time }}` - Current timestamp
- `{{ current_guild }}` - Current server name
- `{{ current_channel }}` - Current channel name

### Creating Custom Tools

1. Create a new file in `src/tools/`
2. Extend the `Tool` class:

```typescript
import { RunContext } from "@openai/agents";
import AgentContext from "../core/AgentContext";
import Tool from "../core/Tool";
import { z } from "zod";

const parametersSchema = z.object({
    // Define your parameters
    param: z.string().describe("Parameter description")
});

export default class YourTool extends Tool<typeof parametersSchema> {
    constructor() {
        super({
            name: "your_tool_name",
            description: "What your tool does",
            parameters: parametersSchema
        });
    }

    public override async execute(
        input: z.infer<typeof parametersSchema>, 
        context?: RunContext<AgentContext>
    ) {
        // Your tool logic here
        const client:  = context?.context.client; // Instance of selfbot client
        const messageParam = context?.context.message; // Message that triggered the bot
        // ...
        return "Tool execution result";
    }
}
```

3. The tool will be automatically loaded on startup

## Project Structure

```
.
├── src/
│   ├── index.ts                # Entry point
│   ├── core/
│   │   ├── Client.ts           # Main bot client
│   │   ├── AgentContext.ts     # Context for agent execution
│   │   └── Tool.ts             # Base tool class
│   └── tools/                  # Tool implementations
├── configs/
│   └── instructions.md         # Bot personality instructions
├── template.env                # Environment variables template
└── package.json
```


**Note**: Remember that selfbots violate Discord's Terms of Service. This project is for fun and educational purposes only.
