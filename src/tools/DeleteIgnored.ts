import { RunContext } from "@openai/agents";
import AgentContext from "../core/AgentContext";
import Tool from "../core/Tool";
import { z } from "zod";

const parametersSchema = z.object({
    user_id: z.string().describe("The ID of the user to unblock.")
});

export default class DeleteIgnored extends Tool<typeof parametersSchema> {
    constructor() {
        super({
            name: "delete_ignored",
            description: `Removes the ignored status from a user, allowing them to interact normally again.`,
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
        const status = await client.relationships.deleteIgnored(user);
        if (status) {
            return `Successfully unignored user ${user.tag} (ID: ${user.id}).`;
        } else {
            return `Failed to unignore user ${user.tag} (ID: ${user.id}).`;
        }
    }
}