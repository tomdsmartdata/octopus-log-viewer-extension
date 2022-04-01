import { ExtensionContext, SecretStorage } from "vscode";

export default class OctopusApiSettings {
	
    private static _instance: OctopusApiSettings;

    constructor(private secretStorage: SecretStorage) {}

    static init(context: ExtensionContext): void {
        /*
        Create instance of new OctopusApiSettings 
        */
       OctopusApiSettings._instance = new OctopusApiSettings(context.secrets);
    }

    static get instance(): OctopusApiSettings {
        /*
        Getter of our OctopusApiSettings existing instance
        */
       return OctopusApiSettings._instance;
    }

    async storeApiServer(apiServer?: string): Promise<void> {
        if(apiServer) {
            this.secretStorage.store("octopus_api_server", apiServer);
        } 
    }

    async storeApiKey(apiKey?: string): Promise<void> {
        /*
        Update values in octopus-logs secret storage
        */
       if(apiKey) {
           this.secretStorage.store("octopus_api_key", apiKey);
       }
    }

    async getApiKey(): Promise<string | undefined> {
        /*
        Retrieve data from secret storage
        */
       return await this.secretStorage.get("octopus_api_key");
    }

    async getApiServer(): Promise<string | undefined> {
        /*
        Retrieve data from secret storage
        */
       return await this.secretStorage.get("octopus_api_server");
    }

    async clearSettings() {
        this.secretStorage.delete("octopus_api_key");
        this.secretStorage.delete("octopus_api_server");
	}
}