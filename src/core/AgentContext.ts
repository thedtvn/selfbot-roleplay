import BotClient from "./Client";
import { Message } from "discord.js-selfbot-v13";

export default class AgentContext {

    client: BotClient;
    message: Message;

    constructor(client: BotClient, message: Message) {
        this.client = client;
        this.message = message;
    }
}
