import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as unzipper from 'unzipper';
import * as os from 'os';
import { runDocker, cleanDockerContainer } from './cmd';

// Needs revision
const DOCKERFILE_CONTENT = `FROM --platform=amd64 ubuntu:20.04

# tzdata install needs to be non-interactive
ENV DEBIAN_FRONTEND=noninteractive

# Set up the enviroment
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    	software-properties-common \
    	vim \
    	curl \
    	wget \
    	git \
    	jq \
    	build-essential \
    	unzip \
    	apt-transport-https \
        python3.8 \
    	python3-venv \
    	python3-pip \
    	python3-setuptools \
        python3-dev \
    	gnupg \
    	g++ \
    	make \
    	gcc \
		nodejs \
    	apt-utils \
        rsync \
    	file \
        dos2unix \
        default-jdk \
		maven \
    	gettext && \
        apt-get clean && \
        ln -sf /usr/bin/python3.8 /usr/bin/python && \
        ln -sf /usr/bin/pip3 /usr/bin/pip

# Install Gradle
ENV GRADLE_VERSION=7.4.2
RUN wget https://services.gradle.org/distributions/gradle-\${GRADLE_VERSION}-bin.zip -P /tmp
RUN unzip -d /opt/gradle /tmp/gradle-\${{GRADLE_VERSION}}-bin.zip
RUN ln -s /opt/gradle/gradle-\${GRADLE_VERSION} /opt/gradle/latest

# Install Linguist
RUN apt-get install -y cmake pkg-config libicu-dev zlib1g-dev libcurl4-openssl-dev libssl-dev ruby-dev
RUN gem install github-linguist


# Install Golang
RUN wget -q -O - https://raw.githubusercontent.com/canha/golang-tools-install-script/master/goinstall.sh | bash

# Install latest codeQL
ENV CODEQL_HOME /root/codeql-home

# Get CodeQL verion
RUN curl --silent "https://api.github.com/repos/github/codeql-cli-binaries/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\\1/' > /tmp/codeql_version

# Get CodeQL Bundle version
RUN curl --silent "https://api.github.com/repos/github/codeql-action/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\\1/' > /tmp/codeql_bundle_version

# Make the codeql folder
RUN mkdir -p \${CODEQL_HOME} \
    /opt/codeql

# Downdload and extract CodeQL Bundle
RUN CODEQL_BUNDLE_VERSION=$(cat /tmp/codeql_bundle_version) && \
    wget -q https://github.com/github/codeql-action/releases/download/\${CODEQL_BUNDLE_VERSION}/codeql-bundle-linux64.tar.gz -O /tmp/codeql_linux.tar.gz && \
    tar -xf /tmp/codeql_linux.tar.gz -C \${CODEQL_HOME} && \
    rm /tmp/codeql_linux.tar.gz

ENV PATH="$PATH:\${CODEQL_HOME}/codeql:/opt/gradle/gradle-\${GRADLE_VERSION}/bin:/root/go/bin:/root/.go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
COPY scripts /root/scripts

# Execute analyze script
WORKDIR /root/
ENTRYPOINT ["/root/scripts/analyze.sh"]`;

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
	console.log('RepoShield extension is now active!');

	// Check if CodeQL is installed
	await setCodeQLPath(os.homedir() + '\\codeql');
	const codeqlInstalled = await isCodeQLInstalled();
	if (!codeqlInstalled) {
		vscode.window.showInformationMessage('CodeQL is not installed. The extension will now attempt to download and install CodeQL.');

		try {
			const codeqlPath = await downloadCodeQL();
			const platform = process.platform;
			let codeqlexepath;
			if (platform == "win32") {
				codeqlexepath = path.join(codeqlPath, 'codeql.exe');
			} else {
				codeqlexepath = path.join(codeqlPath, 'codeql');
			}
			const config = vscode.workspace.getConfiguration('codeQL');
			await config.update('executablePath', codeqlexepath, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CodeQL has been installed at: ${codeqlPath}`);
		} catch (error: any) {
			vscode.window.showErrorMessage(`Error downloading CodeQL: ${error.message}`);
			return; // Exit activation if installation fails
		}
	}

	// Check if the CodeQL extension is installed
	// const codeqlExtension = vscode.extensions.getExtension('GitHub.vscode-codeql');
	// if (!codeqlExtension) {
	// 	vscode.window.showErrorMessage('CodeQL extension not installed.');
	// 	return;
	// }

	// await codeqlExtension.activate();

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found.');
		return;
	}

	const reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');

	// Define the path for the CodeQL database
	const databaseFolder = path.join(reposhieldPath, 'codeql-database');

	if (!fs.existsSync(databaseFolder)) {
		fs.mkdirSync(databaseFolder, { recursive: true });
		await writeFile(path.join(reposhieldPath, 'Dockerfile'), DOCKERFILE_CONTENT);
		vscode.window.showInformationMessage('Created "codeql-database" directory in the workspace.');
	}

	// Register the command to scan the whole workspace/folder
	const disposableFolderScan = vscode.commands.registerCommand('reposhield.scanWorkspace', async () => {
		try {
			// Run the CodeQL CLI to create the database
			vscode.window.showInformationMessage('Creating CodeQL database...');

			const command = `codeql database create "${databaseFolder}" --language=python --source-root="${workspaceFolder.uri.fsPath}" --overwrite`;
			console.log("Command: ", command);
			const createDatabaseProcess = cp.exec(command, { cwd: workspaceFolder.uri.fsPath });
			if (createDatabaseProcess !== null && createDatabaseProcess.stdout !== null && createDatabaseProcess.stderr !== null) {
				createDatabaseProcess.stdout.on('data', (data) => {
					console.log(data);
				});

				createDatabaseProcess.stderr.on('data', (error) => {
					console.error(error);
				});

				createDatabaseProcess.on('close', async (code) => {
					if (code === 0) {
						vscode.window.showInformationMessage(`CodeQL database created successfully at ${databaseFolder}`);
						await analyzeDatabase(databaseFolder, workspaceFolder, reposhieldPath);
					} else {
						vscode.window.showErrorMessage(`CodeQL database creation failed with exit code ${code}`);
					}
				});
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(`Error: ${error.message}`);
		}
	});

	const disposableReadLog = vscode.commands.registerCommand('reposhield.readLog', async () => {
		try {
			await openSarifViewerPannel(path.join(reposhieldPath, 'results.sarif'));
		} catch (error: any) {
			vscode.window.showErrorMessage(`Error: ${error.message}`);
		}
	});


	const disposableDynamic = vscode.commands.registerCommand('reposhield.dynamicanalysis', async () => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Performing dynamic analysis on this workspace...`,
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(() => {
				cleanDockerContainer();
				console.log("User canceled the long running operation");
			});
			await runDocker();
			vscode.window.showInformationMessage("Scanning complete");
		});
	});

	context.subscriptions.push(disposableDynamic);
	context.subscriptions.push(disposableReadLog);
	context.subscriptions.push(disposableFolderScan);
}

// Run a command using child process
async function analyzeDatabase(databaseFolder: string, workspaceFolder: any, reposhieldPath: string) {
	fs.readFile(path.join(databaseFolder, 'baseline-info.json'), 'utf8', (err, data) => {
		if (err) {
			console.error('Error reading the file:', err);
			return;
		}

		try {
			const parsedData = JSON.parse(data);
			const languages = Object.keys(parsedData['languages']);
			let command = `codeql database analyze "${databaseFolder}"`;
			languages.forEach(language => {
				command += ` codeql/${language}-queries`;
			});
			command += ` --format=sarifv2.1.0 --output="${reposhieldPath}\\results.sarif" --download`;

			vscode.window.showInformationMessage('Analyzing database... (this may take a while)');

			console.log("Command: ", command);
			const analyzeDatabaseProcess = cp.exec(command, { cwd: workspaceFolder.uri.fsPath });
			if (analyzeDatabaseProcess !== null && analyzeDatabaseProcess.stdout !== null && analyzeDatabaseProcess.stderr !== null) {
				analyzeDatabaseProcess.stdout.on('data', (data) => {
					console.log(data);
				});

				analyzeDatabaseProcess.stderr.on('data', (error) => {
					console.error("Running... (ignore these errors)", error);
				});

				analyzeDatabaseProcess.on('close', async (code) => {
					if (code === 0) {
						vscode.window.showInformationMessage(`CodeQL database analyzed successfully!`);
						console.log("Opening log");
						await openSarifViewerPannel(path.join(reposhieldPath, 'results.sarif'));
						console.log("Done Opening log");
					} else {
						vscode.window.showErrorMessage(`CodeQL database analysis failed with exit code ${code}`);
					}
				});
			}

		} catch (err) {
			console.error('Error parsing JSON:', err);
			return;
		}
	});
}

async function openSarifViewerPannel(filePath: string) {
	try{
		const sarifExt = vscode.extensions.getExtension('MS-SarifVSCode.sarif-viewer');
		if (sarifExt === undefined) {
			vscode.window.showWarningMessage("Please install 'Sarif Viewer' to view SAST report better.", ...['Install'])
				.then(install => {
					if (install === "Install") {
						vscode.commands.executeCommand('workbench.extensions.installExtension', 'MS-SarifVSCode.sarif-viewer');
					}
				});
			return false;
		}
		vscode.window.showInformationMessage(`Opening log in Sarif Viewer...`);
		if (!sarifExt.isActive) await sarifExt.activate();
		await sarifExt.exports.openLogs([
			vscode.Uri.file(filePath),
		]);
	} catch (err) {
		console.error('Error parsing JSON:', err);
		return;
	}
	
	return true;
}

/**
 * Creates a file at the given filePath with the provided content.
 * @param filePath The path where the file should be created.
 * @param fileContent The content to be written to the file.
 */
async function writeFile(filePath: string, fileContent: string) {
	if (fs.existsSync(filePath)) {
		console.error("File already exists.");
		return;
	}
	fs.writeFile(filePath, fileContent, (err) => {
		if (err) {
			console.error("Failed to create file.");
			return;
		}
		console.log(`File created successfully at: ${filePath}`);
	});
}

// Function to check if CodeQL is installed
async function isCodeQLInstalled(): Promise<boolean> {
	return new Promise((resolve) => {
		cp.exec('codeql --version', (error) => {
			resolve(!error); // if no error, it means CodeQL is installed
		});
	});
}

// Download CodeQL and extract it to a directory
async function downloadCodeQL(): Promise<string> {
	const downloadUrl = await getDownloadUrlForPlatform(); // Modify this URL for your platform

	// Use a global directory for CodeQL (e.g., home directory or a dedicated folder like ~/.codeql or C:\CodeQL)
	const globalCodeQLDirectory = os.homedir() + "\\codeql"; // For example, ~\.codeql or /home/user/.codeql

	// Ensure the directory exists
	if (fs.existsSync(globalCodeQLDirectory)) {
		console.log('CodeQL directory already exists.');
		return globalCodeQLDirectory;
	}

	// Follow the redirect and download the file
	return new Promise((resolve, reject) => {
		https.get(downloadUrl, (res) => {
			if (res.statusCode === 302 || res.statusCode === 301) {
				const redirectUrl = res.headers.location;
				console.log(`Redirecting to: ${redirectUrl}`);
				if (redirectUrl) {
					https.get(redirectUrl, (redirectRes) => {
						if (redirectRes.statusCode !== 200) {
							return reject(new Error(`Failed to download CodeQL. Status Code: ${redirectRes.statusCode}`));
						}

						// Pipe the file to the extraction location
						redirectRes.pipe(unzipper.Extract({ path: os.homedir() }))
							.on('close', async () => {
								console.log('CodeQL downloaded and extracted.');
								resolve(globalCodeQLDirectory);
							})
							.on('error', async (err: any) => {
								console.error('Error during extraction:', err);
								reject(err);
							});
					}).on('error', (err) => {
						console.error('Error following redirect:', err);
						reject(err);
					});
				} else {
					return reject(new Error('Redirect URL is undefined.'));
				}
			} else if (res.statusCode === 200) {
				// If there's no redirection (direct file download)
				res.pipe(unzipper.Extract({ path: os.homedir() }))
					.on('close', async () => {
						console.log('CodeQL downloaded and extracted.');
						resolve(globalCodeQLDirectory);
					})
					.on('error', (err: any) => {
						console.error('Error during extraction:', err);
						reject(err);
					});
			} else {
				return reject(new Error(`Failed to download CodeQL. Status Code: ${res.statusCode}`));
			}
		}).on('error', (err) => {
			console.error('Error during download:', err);
			reject(err);
		});
	});
}

async function setCodeQLPath(codeqlPath: string) {
	process.env.PATH = `${process.env.PATH}${codeqlPath}`;
}

async function getDownloadUrlForPlatform(): Promise<string> {
	const platform = process.platform;
	if (platform === 'win32') {
		return 'https://github.com/github/codeql-cli-binaries/releases/download/v2.20.4/codeql-win64.zip';
	} else if (platform === 'darwin') {
		return 'https://github.com/github/codeql-cli-binaries/releases/download/v2.20.4/codeql-osx64.zip';
	} else if (platform === 'linux') {
		return 'https://github.com/github/codeql-cli-binaries/releases/download/v2.20.4/codeql-linux64.zip';
	} else {
		throw new Error('Unsupported platform');
	}
}

// This method is called when your extension is deactivated
export async function deactivate() { }
