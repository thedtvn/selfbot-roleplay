import BotClient from "./Client";
import { Message, Collection } from "discord.js-selfbot-v13";

export default class MessageManager {
    private static readonly MAX_MESSAGES_PER_CHANNEL = 50;
    private static readonly CACHE_CLEAR_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
    private static readonly MESSAGE_AGE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
    private static readonly DEFAULT_MESSAGE_LIMIT = 10;

    public client: BotClient;
    private messageCache: Collection<string, Message[]> = new Collection();

    constructor(client: BotClient) {
        this.client = client;
        this.client.on('messageCreate', (message: Message) => {
            this.addMessage(message);
        });
        setInterval(() => {
            this.clearCache();
        }, MessageManager.CACHE_CLEAR_INTERVAL_MS);
    }

    public addMessage(message: Message): void {
        let channelMessages = this.messageCache.get(message.channel.id) || [];
        if (channelMessages.find(msg => msg.id === message.id)) return; // Avoid duplicates
        channelMessages.push(message);
        if (channelMessages.length > MessageManager.MAX_MESSAGES_PER_CHANNEL) {
            channelMessages = channelMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp).slice(0, MessageManager.MAX_MESSAGES_PER_CHANNEL);
        }
        this.messageCache.set(message.channel.id, channelMessages);
    }

    public async fetchMessages(message: Message, limit: number = MessageManager.DEFAULT_MESSAGE_LIMIT): Promise<Message[]> {
        const messages = await message.channel.messages.fetch({ limit: 10, before: message.id });
        messages.forEach(msg => this.addMessage(msg));
        return Array.from(messages.filter(msg => msg.createdTimestamp < message.createdTimestamp).values()).slice(-limit);
    }

    public async getMessages(message: Message, limit: number = MessageManager.DEFAULT_MESSAGE_LIMIT): Promise<Message<boolean>[]> {
        const channelMessages = this.messageCache.get(message.channel.id) || [];
        const messages = channelMessages.filter(msg => msg.createdTimestamp < message.createdTimestamp);
        const messageSlice = messages.slice(-limit);
        const fetchedMessages = messageSlice.length < limit ? await this.fetchMessages(message, limit - messageSlice.length) : messageSlice;
        return fetchedMessages;
    }

    public clearCache(): void {
        this.messageCache = this.messageCache.filter((value, _) => {
            return value[value.length - 1].createdTimestamp + MessageManager.MESSAGE_AGE_LIMIT_MS > Date.now();
        });
    }
}