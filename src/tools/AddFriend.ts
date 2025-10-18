import { RunContext } from "@openai/agents";
import AgentContext from "../core/AgentContext";
import Tool from "../core/Tool";
import { z } from "zod";
import { Constants } from "discord.js-selfbot-v13";

const parametersSchema = z.object({
    user_id: z.string().describe("The ID of the user to block.")
});

export default class AddFriend extends Tool<typeof parametersSchema> {
    constructor() {
        super({
            name: "add_friend",
            description: "Sends a friend request to a user, or accepts a pending friend request from them, allowing them to be added to your friends list upon acceptance.",
            parameters: parametersSchema
        });
    }

    public override async execute(input: z.infer<typeof parametersSchema>, context?: RunContext<AgentContext>) {
        const { user_id } = input;
        const client = context?.context.client;
        if (!client) {
            throw new Error("Client not found in context.");
        }
        const user = client.users.cache.get(user_id) || await client.users.fetch(user_id).catch(() => null);
        if (!user) {
            return `User with ID ${user_id} not found.`;
        }
        const status = await client.relationships.addFriend(user);
        if (status) {
            const relationship  = await client.relationships.cache.get(user.id) || await client.relationships.fetch(user.id).catch(() => null);
            if (relationship === Constants.RelationshipTypes.FRIEND) {
                return `Successfully accepted friend request from user ${user.tag} (ID: ${user.id}).`;
            } else if (relationship === Constants.RelationshipTypes.PENDING_OUTGOING) {
                return `Successfully sent friend request to user ${user.tag} (ID: ${user.id}).`;
            } else {
                return `Friend request to user ${user.tag} (ID: ${user.id}) is still pending.`;
            }
        } else {
            return `Failed to send friend request/accept friend request from user ${user.tag} (ID: ${user.id}).`;
        }
    }
}