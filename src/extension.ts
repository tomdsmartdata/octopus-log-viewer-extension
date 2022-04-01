// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import OctopusApiSettings from './OctopusApiSettings';
import * as process from "process";
import { settings } from 'cluster';
import { Client, ClientConfiguration, Repository } from '@octopusdeploy/api-client';
import { DeploymentResource, ProjectResource, ReleaseResource, ResourceCollection } from '@octopusdeploy/message-contracts';
import { BasicRepository } from '@octopusdeploy/api-client/dist/repositories/basicRepository';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Initialize and get current instance of secret storage
	OctopusApiSettings.init(context);
	const octoSettings = OctopusApiSettings.instance;
	let octoConfig: ClientConfiguration;
	let client: Client | undefined;
	let repository: Repository | undefined;
	
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let viewLogsDisposable = vscode.commands.registerCommand('octopus-logs.viewLogs', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		var projects = await getProjects();
		var projectQickPicks = projects?.map<vscode.QuickPickItem>(project => <vscode.QuickPickItem>{
			detail: project.Id,
			description: project.Description,
			label: project.Name,
			somethingElse: project,
			kind: vscode.QuickPickItemKind.Default
		}) ?? [];
		var selectedProject = await vscode.window.showQuickPick(projectQickPicks, {
			title: "Octopus Project"
		});

		if(!selectedProject?.detail) {
			return;
		}
		

		vscode.window.showInformationMessage('View Octopus Deploy Log!');
	});
	context.subscriptions.push(viewLogsDisposable);

	let initOctopusDisposable = vscode.commands.registerCommand('octopus-logs.initOctopus', async () => {
		let envApiKey = process.env["OCTOPUS_CLI_API_KEY"];
		let secretApiKey = await octoSettings.getApiKey();
		const apiKeyInput = await vscode.window.showInputBox({
			title: "Octopus API Key",
			prompt: "Enter your Octopus API key",
			value: secretApiKey ?? envApiKey ?? ""
		});
		await octoSettings.storeApiKey(apiKeyInput);

		let envServer = process.env["OCTOPUS_CLI_SERVER"];
		let secretApiServer = await octoSettings.getApiServer();
		const apiServerInput = await vscode.window.showInputBox({
			title: "Octopus API Server URI",
			prompt: "Enter your Octopus Server URI",
			value: secretApiServer ?? envServer ?? ""
		});
		await octoSettings.storeApiServer(apiServerInput);

		octoConfig = {
			apiKey: apiKeyInput,
			apiUri: apiServerInput,
			autoConnect: true
		};
		await initializeClient();
	});

	let deInitOctopusDisposable = vscode.commands.registerCommand('octopus-logs.deInitOctopus', async () => {
		await octoSettings.clearSettings();
		client = undefined;
		repository = undefined;
	});

	let initializeClient = async () => {
		try {
			let apiKey = await octoSettings.getApiKey();
			let apiServer = await octoSettings.getApiServer();

			octoConfig = {
				apiKey: apiKey,
				apiUri: apiServer,
				autoConnect: true
			};

			client = await Client.create(octoConfig);
			repository = new Repository(client);

			// Use the console to output diagnostic information (console.log) and errors (console.error)
			// This line of code will only be executed once when your extension is activated
			vscode.window.showInformationMessage('Initialized Octopus Deploy');
		} catch(error) {
			console.error(error);
		}
	};

	let getProjects = async () => {
		let projects: ResourceCollection<ProjectResource> | undefined;

		try {
			projects = await repository?.projects.list();
		} catch (error) {
			console.error(error);
		}

		return projects?.Items;
	};

	let getDeployments = async (projectId: string) => {
		let deployments: ResourceCollection<DeploymentResource> | undefined;

		try {
			deployments = await repository?.deployments.list({
				projects: [projectId]
			});
		} catch (error) {
			console.error(error);
		}

		return deployments?.Items;
	};

	initializeClient();
}

// this method is called when your extension is deactivated
export function deactivate() {}
