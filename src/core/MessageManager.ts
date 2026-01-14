import BotClient from "./Client";
import { Message, Collection } from "discord.js-selfbot-v13";

export default class MessageManager {
    private static readonly MAX_MESSAGES_PER_CHANNEL = 50;
    private static readonly CACHE_CLEAR_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
    private static readonly MESSAGE_AGE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
    private static readonly DEFAULT_MESSAGE_LIMIT = 10;

    public client: BotClient;
    private messageCache: Collection<string, Message[]> = new Collection();
    private messageIds: Collection<string, Set<string>> = new Collection();

    constructor(client: BotClient) {
        this.client = client;
        this.client.on('messageCreate', this.addMessage.bind(this));
        setInterval(this.clearCache.bind(this), MessageManager.CACHE_CLEAR_INTERVAL_MS);
    }

    public addMessage(message: Message): void {
        const channelId = message.channel.id;
        const channelMessages = this.messageCache.get(channelId) || [];
        const messageIdSet = this.messageIds.get(channelId) || new Set<string>();

        if (messageIdSet.has(message.id)) return;

        channelMessages.push(message);
        messageIdSet.add(message.id);

        if (channelMessages.length > MessageManager.MAX_MESSAGES_PER_CHANNEL) {
            const removed = channelMessages.shift()!;
            messageIdSet.delete(removed.id);
        }

        this.messageCache.set(channelId, channelMessages);
        this.messageIds.set(channelId, messageIdSet);
    }

    private async fetchMessages(message: Message, limit: number): Promise<Message[]> {
        const messages = await message.channel.messages.fetch({ limit, before: message.id });
        const result: Message[] = [];
        
        for (const msg of messages.values()) {
            this.addMessage(msg);
            if (msg.createdTimestamp < message.createdTimestamp) {
                result.push(msg);
            }
        }
        
        return result.reverse();
    }

    public async getMessages(message: Message, limit: number = MessageManager.DEFAULT_MESSAGE_LIMIT): Promise<Message[]> {
        const channelMessages = this.messageCache.get(message.channel.id) || [];
        
        const cachedMessages = channelMessages
            .filter(msg => msg.createdTimestamp < message.createdTimestamp)
            .slice(-limit);

        if (cachedMessages.length < limit) {
            // Piororitize fetching more messages if cache is insufficient
            const fetchedMessages = await this.fetchMessages(message, limit);
            return fetchedMessages.filter(msg => msg != message);
        }

        return cachedMessages.filter(msg => msg != message);
    }

    private clearCache(): void {
        const now = Date.now();
        const channelsToDelete: string[] = [];

        for (const [channelId, messages] of this.messageCache.entries()) {
            if (messages.length === 0 || 
                messages[messages.length - 1].createdTimestamp + MessageManager.MESSAGE_AGE_LIMIT_MS < now) {
                channelsToDelete.push(channelId);
            }
        }

        for (const channelId of channelsToDelete) {
            this.messageCache.delete(channelId);
            this.messageIds.delete(channelId);
        }
    }
}