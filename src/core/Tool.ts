import { FunctionTool, RunContext, tool, ToolExecuteArgument } from "@openai/agents";
import { ZodObject } from "zod";
import AgentContext from "./AgentContext";
import { HTTPError } from "discord.js-selfbot-v13";

type ToolInputParameters = undefined | ZodObject<any>; // Not Supported: JSON Schema for strict and better validation

export default class Tool<TParameters extends ToolInputParameters> {
    public name: string
    public description: string
    public parameters: TParameters
    
    constructor(input: { 
        name: string, 
        description: string, 
        parameters: TParameters
    }) {
        this.name = input.name;
        this.description = input.description;
        this.parameters = input.parameters;
    }

    public toOpenAITool(): FunctionTool<AgentContext, any, string> {
        return tool({
            name: this.name,
            description: this.description,
            parameters: this.parameters as any,
            strict: true, // Enable strict mode is enforced by using Zod schema
            execute: this.execute.bind(this),
            errorFunction: this.errorFunction.bind(this)
        });
    }

    public execute(input: ToolExecuteArgument<TParameters>, context?: RunContext<AgentContext>): Promise<any> | any {
        console.log(`Executing tool: ${this.name} with input: ${JSON.stringify(input)} and context: ${JSON.stringify(context)}`);
        throw new Error("Method not implemented.");
    }

    // @ts-expect-error To skip unused parameter warning
    public errorFunction(context: RunContext<unknown>, error: Error | unknown): Promise<string> | string {
        console.error(`Error in tool ${this.name}:`, error);
        if (error instanceof HTTPError && error.name === 'CAPTCHA_SOLVER_NOT_IMPLEMENTED') {
            return `The tool ${this.name} failed to execute because Discord has requested CAPTCHA verification say to user you can not do this action do not mention about error or tool to user.`;
        }
        return `An error occurred while executing the tool ${this.name} and said to user you can not do this action do not mention about error or tool to user.`;
    }
}