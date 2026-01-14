import { Agent, AgentInputItem, FunctionTool, setDefaultOpenAIClient, setOpenAIAPI, Runner, setTracingDisabled } from "@openai/agents";
import { Client, Message, RichPresence } from "discord.js-selfbot-v13";
import AgentContext from "./AgentContext";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Mustache from "mustache";
import { OpenAI, AzureOpenAI } from "openai";
import TypingManager from "./TypingManager";
import MessageManager from "./MessageManager";

export default class BotClient extends Client {

    SYSTEM_INSTRUCTIONS = fs.readFileSync('configs/instructions.md', 'utf-8');

    TOOLS: FunctionTool<AgentContext, any, string>[] = [];

    PROVIDER: string = process.env.PROVIDER || 'openai';

    RUNNER: Runner = new Runner();

    ALLOWED_USERS: string[] | null = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : null;

    ALLOWED_GUILDS: string[] | null = process.env.ALLOWED_GUILDS ? process.env.ALLOWED_GUILDS.split(',') : null;

    ALLOWED_CHANNELS: string[] | null = process.env.ALLOWED_CHANNELS ? process.env.ALLOWED_CHANNELS.split(',') : null;

    DISABLE_STATUS: boolean = process.env.DISABLE_STATUS === 'true';

    TYPING_MANAGER = new TypingManager(this);

    MESSAGE_MANAGER = new MessageManager(this);

    constructor() {
        super();
        this.loadModel();
    }

    loadModel() {
        setTracingDisabled(true);
        if (this.PROVIDER === 'azure') {
            // Use dynamic import to get the bundled OpenAI client
            const azureClient = new AzureOpenAI({
                apiKey: process.env.AZURE_OPENAI_API_KEY,
                endpoint: process.env.AZURE_OPENAI_ENDPOINT,
                deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
                apiVersion: process.env.AZURE_OPENAI_API_VERSION
            }) as OpenAI;
            setDefaultOpenAIClient(azureClient);
            setOpenAIAPI('chat_completions')
        } else {
            // Use dynamic import to get the bundled OpenAI client
            const openAIClient = new OpenAI();
            setDefaultOpenAIClient(openAIClient);
        }
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

    isSendAllowed(message: Message): boolean {
        // Piority: Guild > Channel > User
        // If any of the ALLOWED lists is set, only allow those
        if (this.ALLOWED_GUILDS && message.guild && this.ALLOWED_GUILDS.includes(message.guild.id)) {
            return true;
        } else if (this.ALLOWED_CHANNELS && this.ALLOWED_CHANNELS.includes(message.channel.id)) {
            return true;
        } else if (this.ALLOWED_USERS && this.ALLOWED_USERS.includes(message.author.id)) {
            return true;
        }
        // If none of the lists are set, allow all
        return (!this.ALLOWED_GUILDS && !this.ALLOWED_CHANNELS && !this.ALLOWED_USERS);
    }

    initListeners() {
        this.on("ready", () => {
            console.log(`Logged in as ${this.user?.tag}`);
            if (this.DISABLE_STATUS) return; // Skip setting status if disabled
            this.user?.setStatus('online');
            // You can customize the activity as you like
            const richPresence = new RichPresence(this);
            richPresence.setApplicationId("782685898163617802"); // VSCord App ID for template
            richPresence.setName("Role Playing with AI");
            richPresence.setState("This is a selfbot Role Playing");
            richPresence.setType("PLAYING");
            richPresence.setButtons({
                name: "GitHub Repository",
                url: "https://github.com/thedtvn/selfbot-roleplay"
            });
            this.user?.setActivity(richPresence);
        });

        this.on("messageCreate", async (message) => {
            if (message.author.id === this.user?.id) return; // Prevent from doom looping
            if (!message.mentions.has(this.user!) && message.channel.type !== 'DM') return; // Only respond if mentioned if in DMS will respond always
            if (!this.isSendAllowed(message)) return; // Check if allowed to respond in this context
            const stopTyping = this.TYPING_MANAGER.startTyping(message.channel); // Start typing indicator task
            const channelHistory = await this.MESSAGE_MANAGER.getMessages(message, 10);
            const messages = Array.from(channelHistory.values()).reverse(); // Reverse to get chronological order
            messages.push(message); // include the current message
            const response = await this.getResponse(messages);
            if (!response) return;
            stopTyping(); // Stop typing indicator task
            message.reply(response).catch((err) => {
                console.error("Failed to send reply:", err);
             }).finally(() => 
                this.TYPING_MANAGER.sendComplete(message.channel) // Restart typing indicator if there are other tasks
            );
        });
    }

    formartMessages(messages: Message[]): Promise<AgentInputItem[]> {
        return Promise.all(messages
            .filter(msg => !msg.author.bot) // filter out bot messages or context may contain bot junks
            .map(async msg => {
                const isMe = msg.author === this.user;
                if (isMe) {
                    return {
                        type: 'message' as const,
                        role: 'assistant' as const,
                        status: 'completed' as const,
                        content: [{ type: 'output_text' as const, text: msg.content }]
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
                        userInfomation['Activities'] = "\n" + activities;
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

                    const attachments = Array.from(msg.attachments.values());

                    const renderedMessageInfo = Object.entries(messageInfomation)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n');
                    return {
                        type: 'message' as const,
                        role: 'user' as const,
                        content: [
                            { type: 'input_text' as const, text: msg.content },
                            { type: 'input_text' as const, text: `Message context:\n${renderedMessageInfo}\n\nUser context:\n${renderedContent}` },
                            ...attachments.map(att => {
                                if (att.contentType && /^image\/(png|jpe?g)$/i.test(att.contentType)) {
                                    return { 
                                        type: 'input_image' as const,
                                        image: att.url,
                                        providerData: { 
                                            fileName: att.name || 'unknown',
                                            description: att.description || 'N/A'
                                        }
                                    };
                                } else {
                                    return { 
                                        type: 'input_text' as const,
                                        text: `Attachment Name: ${att.name || 'unknown'}\nDescription: ${att.description || 'N/A'}\nContent Type: ${att.contentType || 'N/A'}\nUnsupported attachment type.`
                                    };
                                }
                            })
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
            current_guild: message.guild ? `${message.guild.name} (ID: ${message.guild.id})` : message.channel.type === 'DM' ? "DM" : "Group DM",
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
