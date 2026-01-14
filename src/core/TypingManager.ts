import { TextBasedChannel } from "discord.js-selfbot-v13";
import BotClient from "./Client";
import crypto from "node:crypto";

export default class TypingManager {
    public client: BotClient;

    private typingTasks: Map<string, NodeJS.Timeout> = new Map();
    private tasks: Map<string, string[]> = new Map();


    constructor(client: BotClient) {
        this.client = client;
    }

    public startTyping(channel: TextBasedChannel) {
        const taskId = crypto.randomUUID();
        
        if (this.tasks.has(channel.id)) {
            this.tasks.get(channel.id)!.push(taskId);
        } else {
            this.tasks.set(channel.id, [taskId]);
        }
        
        if (this.typingTasks.has(channel.id)) {
            return () => this.stopTyping(channel, taskId);
        }
        
        channel.sendTyping().catch(() => {});
        
        const typingTask = setInterval(() => {
            channel.sendTyping().catch(() => {});
        }, 9 * 1000);
        
        this.typingTasks.set(channel.id, typingTask);
        
        return () => this.stopTyping(channel, taskId);
    }

    public stopTyping(channel: TextBasedChannel, taskId: string) {
        const typingTasks = this.tasks.get(channel.id);
        if (!typingTasks) return;
        
        const filteredTasks = typingTasks.filter(t => t !== taskId);
        
        if (filteredTasks.length === 0) {
            this.tasks.delete(channel.id);
            const typingTask = this.typingTasks.get(channel.id);
            if (typingTask) {
                clearInterval(typingTask);
                this.typingTasks.delete(channel.id);
            }
        } else {
            this.tasks.set(channel.id, filteredTasks);
        }
    }

    public sendComplete(channel: TextBasedChannel) {
        const tasks = this.tasks.get(channel.id);
        if (!tasks || tasks.length === 0) return;
        
        if (this.typingTasks.has(channel.id)) return;
        
        channel.sendTyping().catch(() => {});
        const typingTask = setInterval(() => {
            channel.sendTyping().catch(() => {});
        }, 9 * 1000);
        
        this.typingTasks.set(channel.id, typingTask);
    }
}