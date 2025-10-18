import { RunContext } from "@openai/agents";
import AgentContext from "../core/AgentContext";
import Tool from "../core/Tool";
import { z } from "zod";

const parametersSchema = z.object({
    user_id: z.string().describe("The ID of the user to block."),
    message: z.string().nullable().describe("The messages send to DM before block user.")
});

export default class AddBlocked extends Tool<typeof parametersSchema> {
    constructor() {
        super({
            name: "add_blocked",
            description: "Blocks a user from continuing to chat with in derict messages.",
            parameters: parametersSchema
        });
    }

    public override async execute(input: z.infer<typeof parametersSchema>, context?: RunContext<AgentContext>) {
        const { user_id, message } = input;
        const client = context?.context.client;
        if (!client) {
            throw new Error("Client not found in context.");
        }
        const user = client.users.cache.get(user_id) || await client.users.fetch(user_id).catch(() => null);
        if (!user) {
            return `User with ID ${user_id} not found.`;
        }
        if (message) await user.send(message).catch(() => {});
        const status = await client.relationships.addBlocked(user);
        if (status) {
            return `Successfully blocked user ${user.tag} (ID: ${user.id}).`;
        } else {
            return `Failed to block user ${user.tag} (ID: ${user.id}).`;
        }
    }
}