import { Agent, AgentInputItem, FunctionTool, setDefaultOpenAIClient, setOpenAIAPI, Runner } from "@openai/agents";
import { Client, Message } from "discord.js-selfbot-v13";
import AgentContext from "./AgentContext";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Mustache from "mustache";
import { OpenAI, AzureOpenAI } from "openai";

export default class BotClient extends Client {

    SYSTEM_INSTRUCTIONS = fs.readFileSync('configs/instructions.md', 'utf-8');

    TOOLS: FunctionTool<AgentContext, any, string>[] = [];

    PROVIDER: string = process.env.PROVIDER || 'openai';

    RUNNER: Runner = new Runner();

    constructor() {
        super();
        this.loadModel();
    }

    loadModel() {
        if (this.PROVIDER === 'azure') {
            // Use dynamic import to get the bundled OpenAI client
            const azureClient = new AzureOpenAI({
                apiKey: process.env.AZURE_OPENAI_API_KEY,
                endpoint: process.env.AZURE_OPENAI_ENDPOINT,
                deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
                apiVersion: process.env.AZURE_OPENAI_API_VERSION
            }) as OpenAI;
            setDefaultOpenAIClient(azureClient);
        } else {
            // Use dynamic import to get the bundled OpenAI client
            const openAIClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            }) as OpenAI;
            setDefaultOpenAIClient(openAIClient);
        }
        setOpenAIAPI('chat_completions')
    }

    async loadTools() {
        const currentFileDir = path.dirname(__filename);
        const toolsDir = path.join(currentFileDir, '../tools');
        const toolFiles = fs.readdirSync(toolsDir).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        let toolLoaded = 0;
        for (const file of toolFiles) {
            const filePath = path.join(toolsDir, file);
            const fileURL = pathToFileURL(filePath).href;
            const toolModule = await import(fileURL);
            
            // Handle ES module exports - check for .default property
            let ToolClass = toolModule.default;
            
            // If default is an object with a default property (double-wrapped), unwrap it
            if (ToolClass && typeof ToolClass === 'object' && 'default' in ToolClass) {
                ToolClass = ToolClass.default;
            }
            
            // Fallback to the module itself if no default export
            if (!ToolClass) {
                ToolClass = toolModule;
            }
            
            if (typeof ToolClass !== 'function') {
                console.warn(`Skipping ${file}: exported module is not a constructor. Module keys:`, Object.keys(toolModule));
                continue;
            }
            
            const toolInstance: FunctionTool<AgentContext, any, string> = new ToolClass().toOpenAITool();
            this.TOOLS.push(toolInstance);
            toolLoaded++;
        }
        console.log(`Loaded ${toolLoaded}/${toolFiles.length} tools.`);
    }

    initListeners() {
        this.on("ready", () => {
            console.log(`Logged in as ${this.user?.tag}`);
            this.user?.setStatus('online');
            // You can customize the activity as you like
            this.user?.setActivity({
                name: "Role Playing with AI",
                type: 'STREAMING',
                state: "This is a selfbot Role Playing",    
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            });
        });

        this.on("messageCreate", async (message) => {
            if (message.author.id === this.user?.id) return; // Prevent from doom looping
            if (!message.mentions.has(this.user!) && message.channel.type !== 'DM') return; // Only respond if mentioned or in DM
            await message.channel.sendTyping();
            const channelHistory = await message.channel.messages.fetch({ limit: 10, before: message.id });
            const messages = Array.from(channelHistory.values()).reverse(); // Reverse to get chronological order
            messages.push(message); // include the current message
            const response = await this.getResponse(messages);
            if (!response) return;
            message.reply(response).catch(() => {});
        });
    }

    formartMessages(messages: Message[]): Promise<AgentInputItem[]> {
        return Promise.all(messages
            .filter(msg => !msg.author.bot) // filter out bot messages or context may contain bot junks
            .map(async msg => {
                const isMe = msg.author === this.user;
                if (isMe) {
                    return {
                        type: 'message',
                        role: 'assistant',
                        status: 'completed',
                        content: [{ type: 'output_text', text: msg.content }]
                    };
                } else {

                    const userInfomation: Record<string, any> = {
                        username: msg.author.username,  
                        displayName: msg.author.globalName || msg.author.tag,
                        user_id: msg.author.id,
                        nickname: msg.member?.nickname || "N/A",
                        relationship: msg.author.relationship,
                        status: msg.member?.presence?.status || "N/A"
                    };

                    const memberPresence = msg.member?.presence;
                    if (memberPresence?.activities && memberPresence.activities.length > 0) {
                        const activities = memberPresence.activities.map(activity => {
                            return `Type: ${activity.type}\nName: ${activity.name}\nDetails: ${activity.details || 'N/A'}\nState: ${activity.state || 'N/A'}`;
                        }).join('\n\n');
                        userInfomation['Activities'] = "\n"+activities;
                    }

                    const renderedContent = Object.entries(userInfomation)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n');

                    let referenceMessagesData = null;

                    // @ts-expect-error -- reference type is private and not in d.ts
                    if (msg.reference && msg.reference.type == "DEFAULT" && msg.reference.messageId) {
                        const messageManagerReference = msg.channel.messages; // Reply can only reply on same channel
                        const messageReference = messageManagerReference.cache.get(msg.reference.messageId) || await messageManagerReference.fetch(msg.reference.messageId).catch(() => null);
                        referenceMessagesData = {
                            message_id: messageReference?.id,
                            author_id: messageReference?.author.id,
                            author_username: messageReference?.author.username,
                            author_display_name: messageReference?.author.globalName || messageReference?.author.tag,
                            content: messageReference?.content || "",
                        };
                    }
                    
                    const messageInfomation: Record<string, any> = {
                        message_id: msg.id,
                    };
                    if (referenceMessagesData) {
                        Object.entries(referenceMessagesData).forEach(([key, value]) => {
                            messageInfomation[`reply_to_${key}`] = value;
                        });
                    }
                    const renderedMessageInfo = Object.entries(messageInfomation)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n');
                    return {
                        type: 'message',
                        role: 'user',
                        content: [
                            { type: 'input_text', text: msg.content },
                            { type: 'input_text', text: `Message context:\n${renderedMessageInfo}\nUser context:\n${renderedContent}` }
                        ]
                    };
                }
            })
        );
    }

    async getResponse(messages: Message[]): Promise<string | undefined> {
        const agent = this.createAgent(messages[0]);
        const formattedMessages = await this.formartMessages(messages);
        const response = await this.RUNNER.run(
            agent,
            formattedMessages,
            { 
                context: new AgentContext(this, messages[0])
            }
        );
        return response.finalOutput;
    }

    fomartSystemInstructions(message: Message) {
        if (!this.user) return this.SYSTEM_INSTRUCTIONS;
        return Mustache.render(this.SYSTEM_INSTRUCTIONS, {
            username: this.user.username,
            user_global_name: this.user.globalName || this.user.tag,
            user_id: this.user.id,
            current_guild: message.guild ? `${message.guild.name} (ID: ${message.guild.id})` : "DM",
            current_channel: message.channel.type === 'DM' ? "DM" : `${message.channel.name} (ID: ${message.channel.id})`,
            current_time: new Date().toISOString() // use to add relevant time info like what day is today or current time
        });
    }


    createAgent(message: Message): Agent<AgentContext> {
        return new Agent<AgentContext>({
            name: 'master-agent',
            instructions: this.fomartSystemInstructions(message),
            tools: this.TOOLS,
            model: this.PROVIDER === 'azure' ? process.env.AZURE_OPENAI_DEPLOYMENT_NAME! : undefined // if undefined, it will use the default model set using OPENAI_DEFAULT_MODEL
        });
    }

    async start() {
        await this.loadTools();
        this.initListeners();
        const token = process.env.TOKEN;
        if (!token) {
            throw new Error("No token provided in environment variables (TOKEN)");
        }
        await this.login(token);
    }

}
