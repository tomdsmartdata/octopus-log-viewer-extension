// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import OctopusApiSettings from './OctopusApiSettings';
import * as process from "process";
import { Client, ClientConfiguration, Repository } from '@octopusdeploy/api-client';
import { DeploymentResource, ProjectResource, ReleaseResource, ResourceCollection } from '@octopusdeploy/message-contracts';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Initialize and get current instance of secret storage
	OctopusApiSettings.init(context);
	const octoSettings = OctopusApiSettings.instance;
	let octoConfig: ClientConfiguration;
	let client: Client | undefined;
	let repository: Repository | undefined;
	let selectedProject: ProjectResource | undefined;
	let selectedRelease: ReleaseResource | undefined;
	

	// Register commands
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

	let selectProjectDisposable = vscode.commands.registerCommand('octopus-logs.selectProject', async () => {
		var projects = await getProjects();
		var projectQickPicks = projects?.map<vscode.QuickPickItem>(project => <vscode.QuickPickItem>{
			detail: project.Id,
			description: project.Description,
			label: project.Name,
			somethingElse: project,
			kind: vscode.QuickPickItemKind.Default
		}) ?? [];
		var quickSelectSelection = await vscode.window.showQuickPick(projectQickPicks, {
			title: "Octopus Project"
		});

		if(!quickSelectSelection?.detail) {
			return;
		}
		selectedProject = projects?.filter(p => p.Id === quickSelectSelection?.detail)[0] ?? undefined;
		vscode.window.showInformationMessage(`Selected project ${selectedProject?.Name}`);
	});

	let selectReleaseDisposable = vscode.commands.registerCommand('octopus-logs.selectRelease', async () => {
		if(!selectedProject) {
			await vscode.commands.executeCommand('octopus-logs.selectProject');
			if(!selectedProject) { return; }
		}
		var releases = await getReleases(selectedProject);
		var releaseQuickPicks = releases?.map<vscode.QuickPickItem>(release => <vscode.QuickPickItem>{
			detail: release.Id,
			description: release.ReleaseNotes,
			label: release.Version,
			somethingElse: release,
			kind: vscode.QuickPickItemKind.Default
		}) ?? [];

		var quickSelectSelection = await vscode.window.showQuickPick(releaseQuickPicks, {
			title: `Octopus Release for ${selectedProject.Name}` 
		});

		if(!quickSelectSelection?.detail) {
			return;
		}
		selectedRelease = releases?.filter(r => r.Id === quickSelectSelection?.detail)[0] ?? undefined;
		vscode.window.showInformationMessage(`Selected release ${quickSelectSelection.detail}`);
	});

	let selectDeploymentDisposable = vscode.commands.registerCommand('octopus-logs.selectDeployment', async () => {

	});

	let viewLogsDisposable = vscode.commands.registerCommand('octopus-logs.viewLogs', async () => {
		if(!selectedRelease) {
			await vscode.commands.executeCommand('octopus-logs.selectRelease');
			if(!selectedRelease) { return; }
		}

		var latestDeployment = await getLatestDeploymentLog(selectedRelease);
	});
	context.subscriptions.push(initOctopusDisposable);
	context.subscriptions.push(deInitOctopusDisposable);
	context.subscriptions.push(selectProjectDisposable);
	context.subscriptions.push(selectReleaseDisposable);
	context.subscriptions.push(viewLogsDisposable);


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

	let getReleases = async (project: ProjectResource) => {
		let releases: ResourceCollection<ReleaseResource> | undefined;

		try {
			releases = await repository?.projects.getReleases(project);
		} catch (error) {
			console.error(error);
		}
		return releases?.Items;
	};

	let getLatestDeploymentLog = async (selectedRelease: ReleaseResource) => {
		let deployments: ResourceCollection<DeploymentResource> | undefined;

		try {
			deployments = await repository?.releases.getDeployments(selectedRelease);
			if(!deployments?.Items) { return; }
			var links = deployments.Items[0].Links;
			var taskUrl = links["Task"];
			var taskRaw: string | undefined = await repository?.client.getRaw(`${taskUrl}/raw`);
			if(!taskRaw) { return; }
			var taskParsed = Object.values(JSON.parse(taskRaw)).join("");
			await vscode.workspace.openTextDocument({
				language: "log",
				content: taskParsed
			});
		} catch (error) {
			console.error(error);
		}
		return deployments?.Items[0] || undefined;
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


