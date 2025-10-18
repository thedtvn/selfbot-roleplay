import { RunContext } from "@openai/agents";
import AgentContext from "../core/AgentContext";
import Tool from "../core/Tool";
import { z } from "zod";

const parametersSchema = z.object({
    user_id: z.string().describe("The ID of the user to unblock.")
});

export default class DeleteRelationship extends Tool<typeof parametersSchema> {
    constructor() {
        super({
            name: "delete_relationship",
            description: `Unblocks/Unfriends a user, allowing them to chat with you again if they were previously blocked. 
            If they were a friend, this will also remove them from your friends list. and return to NONE relationship.`,
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
        const status = await user?.deleteRelationship();
        if (status) {
            return `Successfully deleted relationship with user ${user.tag} (ID: ${user.id}).`;
        } else {
            return `Failed to delete relationship with user ${user.tag} (ID: ${user.id}).`;
        }
    }
}