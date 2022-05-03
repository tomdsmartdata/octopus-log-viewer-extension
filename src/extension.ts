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
	let selectedDeployment: DeploymentResource | undefined;

	let octopusStatusBarItem: vscode.StatusBarItem;
	

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

	let setProjectDisposable = vscode.commands.registerCommand('octopus-logs.setProject', async () => {
		selectedProject = await selectProject();
		vscode.window.showInformationMessage(`Selected project ${selectedProject?.Name}`);
		await updateOctopusStatusBarItem();
	});

	let setReleaseDisposable = vscode.commands.registerCommand('octopus-logs.setRelease', async () => {
		var _selectedProject = selectedProject;
		if(!_selectedProject) {
			// await vscode.commands.executeCommand('octopus-logs.setProject');
			_selectedProject = await selectProject();
			if(!_selectedProject) { return; }
		}
		selectedRelease = await selectRelease(_selectedProject);
		vscode.window.showInformationMessage(`Selected release ${selectedRelease?.Version}`);
		await updateOctopusStatusBarItem();
	});

	let selectDeploymentDisposable = vscode.commands.registerCommand('octopus-logs.selectDeployment', async () => {
		if(!selectedRelease) {
			await vscode.commands.executeCommand('octopus-logs.setRelease');
			if(!selectedRelease) { return; }
		}
		var _selectedDeployment = await selectDeployment(selectedRelease);
		selectedDeployment = _selectedDeployment;
		vscode.window.showInformationMessage(`Selected deployment ${selectedDeployment?.Name}`);
		await updateOctopusStatusBarItem();
	});

	let viewLatestLogDisposable = vscode.commands.registerCommand('octopus-logs.viewLatestLog', async () => {
		if(!selectedRelease) {
			await vscode.commands.executeCommand('octopus-logs.setRelease');
			if(!selectedRelease) { return; }
		}

		var latestDeployment = await getLatestDeploymentLog(selectedRelease);
	});

	let viewDeploymentLogDisposable = vscode.commands.registerCommand('octopus-logs.viewDeploymentLog', async () => {
		if(!selectedDeployment) {
			await vscode.commands.executeCommand('octopus-logs.selectDeployment');
			if(!selectedDeployment) { return; }
		}
		await getDeploymentLog(selectedDeployment);
	});

	let clearProjectDisposable = vscode.commands.registerCommand('octopus-logs.clearProject', async () => {
		selectedProject = undefined;
		await updateOctopusStatusBarItem();
	});

	let clearReleaseDisposable = vscode.commands.registerCommand('octopus-logs.clearRelease', async () => {
		await vscode.commands.executeCommand('octopus-logs.clearProject');
		selectedRelease = undefined;
		await updateOctopusStatusBarItem();
	});

	let clearDeploymentDisposable = vscode.commands.registerCommand('octopus-logs.clearDeployment', async () => {
		await vscode.commands.executeCommand('octopus-logs.clearRelease');
		selectedDeployment = undefined;
		await updateOctopusStatusBarItem();
	});

	context.subscriptions.push(initOctopusDisposable);
	context.subscriptions.push(deInitOctopusDisposable);
	context.subscriptions.push(setProjectDisposable);
	context.subscriptions.push(setReleaseDisposable);
	context.subscriptions.push(selectDeploymentDisposable);
	context.subscriptions.push(viewLatestLogDisposable);
	context.subscriptions.push(viewDeploymentLogDisposable);
	context.subscriptions.push(clearProjectDisposable);
	context.subscriptions.push(clearReleaseDisposable);
	context.subscriptions.push(clearDeploymentDisposable);

	octopusStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	octopusStatusBarItem.command = 'octopus-logs.viewDeploymentLog';
	context.subscriptions.push(octopusStatusBarItem);

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

	let updateOctopusStatusBarItem = async () => {
		let selectedPath: string = '';
		selectedPath += selectedProject?.Name ?? '';
		if(selectedRelease) {
			selectedPath += ` > ${selectedRelease.Version}`;
		}
		if(selectedDeployment) {
			selectedPath += ` > ${selectedDeployment.Name}`;
		}
		octopusStatusBarItem.text = `$(file) ${selectedPath}`;
	};

	/**
	 *	Retrieve data from API
	 */
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

	let getDeployments = async (selectedRelease: ReleaseResource): Promise<DeploymentResource[]> => {
		let deployments: ResourceCollection<DeploymentResource> | undefined;
		let deploymentItems: DeploymentResource[] | undefined = [];

		try {
			deployments = await repository?.releases.getDeployments(selectedRelease);
			deploymentItems = deployments?.Items.sort((firstDeployment,secondDeployment)=> {
				if(firstDeployment.Created < secondDeployment.Created) {return -1;}
				else if (firstDeployment.Created === secondDeployment.Created) { return 0;}
				else {return 1;}
			});
		} catch (error) {
			console.error(error);
		}

		return deploymentItems ?? [];
	};

	let getDeploymentLog = async ( _selectedDeployment: DeploymentResource) => {
		try {
			var links = _selectedDeployment.Links;
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

	/**
	 * Select items
	 */
	let selectProject = async(): Promise<ProjectResource | undefined> => {
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
		return projects?.filter(p => p.Id === quickSelectSelection?.detail)[0] ?? undefined;
	};

	let selectRelease = async(selectedProject: ProjectResource): Promise<ReleaseResource | undefined> => {
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
		return releases?.filter(r => r.Id === quickSelectSelection?.detail)[0] ?? undefined;
	};

	let selectDeployment = async(_selectedRelease: ReleaseResource): Promise<DeploymentResource | undefined> => {
				
		var deployments = await getDeployments(_selectedRelease);
		var deploymentQuickPickOptions = deployments?.map<vscode.QuickPickItem>(deployment => <vscode.QuickPickItem>{
			detail: deployment.Id,
			label: deployment.Name,
			somethingElse: deployment,
			kind: vscode.QuickPickItemKind.Default
		}) ?? [];
		var quickSelectSelection = await vscode.window.showQuickPick(deploymentQuickPickOptions, {
			title: `Octopus Deployment for ${_selectedRelease.Version}`
		});
		if(!quickSelectSelection?.detail) {
			return;
		}
		return deployments?.filter(d => d.Id === quickSelectSelection?.detail)[0] ?? undefined;
	};

	initializeClient();
	updateOctopusStatusBarItem();
	octopusStatusBarItem.show();
}

// this method is called when your extension is deactivated
export function deactivate() {}


