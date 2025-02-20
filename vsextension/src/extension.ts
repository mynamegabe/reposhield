import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as unzipper from 'unzipper';
import * as os from 'os';

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
		vscode.window.showInformationMessage('Created "codeql-database" directory in the workspace.');
	}

	// Create the workdir if it doesn't exist
	if (!fs.existsSync(reposhieldPath)) {
		fs.mkdirSync(reposhieldPath, { recursive: true });
		vscode.window.showInformationMessage('Created "workdir" directory in the workspace.');
	}

	await writeQueries(reposhieldPath);

	// Register the command to scan a single file
	// const disposableFileScan = vscode.commands.registerCommand('reposhield.scanFile', async () => {
		// const editor = vscode.window.activeTextEditor;
		// if (editor) {
		// 	const filePath = editor.document.uri.fsPath;
		// 	console.log('Scanning file:', filePath);
		// 	await scanCode(filePath);
		// } else {
		// 	vscode.window.showErrorMessage('No active file to scan!');
		// }
		
	// 	try {
	// 		vscode.commands.executeCommand('codeQL.runQuery', '.reposhield\\vulns.ql')
	// 			.then(() => {
	// 				vscode.window.showInformationMessage('CodeQL query completed successfully!');
	// 			}, (err) => {
	// 				vscode.window.showErrorMessage(`CodeQL query failed: ${err.message}`);
	// 			});
	// 	} catch (error:any) {
	// 		vscode.window.showErrorMessage(`Error: ${error.message}`);
	// 	}
	// });

	// Register the command to scan the whole workspace/folder
	const disposableFolderScan = vscode.commands.registerCommand('reposhield.scanWorkspace', async () => {
		// const folderUri = await vscode.window.showOpenDialog({ canSelectFolders: true, openLabel: 'Select Folder' });
		// if (folderUri && folderUri.length > 0) {
		// 	const folderPath = folderUri[0].fsPath;
		// 	await scanCode(folderPath, true);
		// } else {
		// 	vscode.window.showErrorMessage('No folder selected to scan!');
		// }
		try {
			// Run the CodeQL CLI to create the database
			vscode.window.showInformationMessage('Creating CodeQL database...');

			const command = `codeql database create ${databaseFolder} --language=python --source-root=${workspaceFolder.uri.fsPath} --overwrite`;
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
						await analyzeDatabase(databaseFolder, workspaceFolder);
						openSarifViewerPannel(path.join(databaseFolder, 'results.sarif'));
					} else {
						vscode.window.showErrorMessage(`CodeQL database creation failed with exit code ${code}`);
					}
				});
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(`Error: ${error.message}`);
		}
	});

	// context.subscriptions.push(disposableFileScan);
	context.subscriptions.push(disposableFolderScan);
}

// Scan the code using CodeQL
// async function scanCode(targetPath: string, isFolder: boolean = false) {
// 	const codeqlPath = os.homedir() + '\\codeql'; // Replace this with the correct path to CodeQL
// 	const queryPath = '/path/to/your/queries'; // Replace this with the path to your CodeQL queries

// 	let command: string;

// 	if (isFolder) {
// 		command = `${codeqlPath} database analyze ${targetPath} --format=sarif-latest --output=scan-results.sarif`;
// 	} else {
// 		command = `${codeqlPath} query run ${queryPath}/vulnerabilities.ql --database=${targetPath} --format=sarif-latest --output=scan-results.sarif`;
// 	}

// 	try {
// 		const result = await runCommand(command);
// 		const scanResults = JSON.parse(result);

// 		// Highlight found vulnerabilities in the editor
// 		if (scanResults?.runs?.[0]?.results?.length) {
// 			highlightVulnerabilities(scanResults.runs[0].results);
// 		} else {
// 			vscode.window.showInformationMessage('No vulnerabilities found.');
// 		}
// 	} catch (error) {
// 		vscode.window.showErrorMessage('Error during scanning: ' + error);
// 	}
// }

// Run a command using child process
async function analyzeDatabase(databaseFolder: string, workspaceFolder: any) {
	fs.readFile(path.join(databaseFolder, 'baseline-info.json'), 'utf8', (err, data) => {
		if (err) {
			console.error('Error reading the file:', err);
			return;
		}

		try {
			const parsedData = JSON.parse(data);
			const languages = Object.keys(parsedData['languages']);
			let command = `codeql database analyze ${databaseFolder}`;
			languages.forEach(language => {
				command += ` codeql/${language}-queries`;
			});
			command += ` --format=sarifv2.1.0 --output=${databaseFolder}\\results.sarif --download`;

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

				analyzeDatabaseProcess.on('close', (code) => {
					if (code === 0) {
						vscode.window.showInformationMessage(`CodeQL database analyzed successfully!`);
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
	if (!sarifExt.isActive) await sarifExt.activate();
	await sarifExt.exports.openLogs([
		vscode.Uri.file(filePath),
	]);
	return true;
}


async function runCommand(command: string): Promise<string> {
	return new Promise((resolve, reject) => {
		cp.exec(command, (error:any, stdout, stderr) => {
			if (error || stderr) {
				reject(`Error: ${stderr || error.message}`);
			}
			resolve(stdout);
		});
	});
}

// Highlight vulnerabilities found by CodeQL in the editor
// async function highlightVulnerabilities(vulnerabilities: any[]) {
// 	const editor = vscode.window.activeTextEditor;
// 	if (!editor) return;

// 	const decorations: vscode.DecorationOptions[] = [];

// 	vulnerabilities.forEach((vuln: any) => {
// 		const startLine = vuln.location?.start?.line - 1; // CodeQL output uses 1-based indexing
// 		const startChar = vuln.location?.start?.column - 1; // CodeQL output uses 1-based indexing
// 		const endLine = vuln.location?.end?.line - 1;
// 		const endChar = vuln.location?.end?.column - 1;

// 		if (startLine !== undefined && endLine !== undefined) {
// 			const range = new vscode.Range(
// 				new vscode.Position(startLine, startChar),
// 				new vscode.Position(endLine, endChar)
// 			);

// 			const decoration: vscode.DecorationOptions = {
// 				range,
// 				renderOptions: {
// 					before: {
// 						contentText: '⚠️',
// 						color: 'red',
// 						margin: '0 0.5em 0 0'
// 					},
// 					background: 'rgba(255, 0, 0, 0.1)'
// 				}
// 			};

// 			decorations.push(decoration);
// 		}
// 	});

// 	// Create a decoration type
// 	const decorationType = vscode.window.createTextEditorDecorationType({});
// 	editor.setDecorations(decorationType, decorations);
// }

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

async function writeQueries(dirPath: string) {
	// Define the query string (you can customize this query)
	const queryString = `
        import cpp

        from Function f
        where f.getLocation().getFile().getPath().contains("example")
        select f, f.getLocation()
      `;

	// Generate a unique filename for the .ql query
	const queryFileName = 'vulns.ql';
	const queryFilePath = path.join(dirPath, queryFileName);

	// Write the query string to the .ql file in the workdir
	fs.writeFileSync(queryFilePath, queryString);

	console.log("Queries written!");
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
