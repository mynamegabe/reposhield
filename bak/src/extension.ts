import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as unzipper from 'unzipper';
import * as os from 'os';
import { runDocker, cleanDockerContainer } from './cmd';

// Needs revision
// Maybe make it modify the packages installed based on what languages are being used
// Dockerfile and analyze.sh can be taken from the github repo instead  of hardcode in here (maybe)
const DOCKERFILE_CONTENT = `FROM ubuntu:20.04

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
RUN unzip -d /opt/gradle /tmp/gradle-\${GRADLE_VERSION}-bin.zip
RUN ln -s /opt/gradle/gradle-\${GRADLE_VERSION} /opt/gradle/latest

# Install Linguist
RUN apt-get install -y cmake pkg-config libicu-dev zlib1g-dev libcurl4-openssl-dev libssl-dev ruby-dev
RUN gem install github-linguist

# Install Golang
RUN wget -q -O - https://raw.githubusercontent.com/canha/golang-tools-install-script/master/goinstall.sh | bash

ENV PATH="$PATH:/opt/gradle/gradle-\${GRADLE_VERSION}/bin:/root/go/bin:/root/.go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# RUN wget https://raw.githubusercontent.com/reposhield/scripts/analyze.zip -P /tmp
# RUN unzip -d /root/scripts /tmp/analyze.zip
COPY analyze.sh /root/scripts/analyze.sh
RUN chmod +x /root/scripts/analyze.sh

# Execute analyze script
WORKDIR /root/
ENTRYPOINT ["/root/scripts/analyze.sh"]`;

const ANALYZE_SH_CONTENT = `#!/bin/bash

# Ensure necessary environment variables are set
if [ -z "$EXECMD" ]; then
  echo "EXECMD is not set! Please provide the command to start the web service."
  exit 1
fi

if [ -z "$ENDPOINTS" ]; then
  echo "ENDPOINTS is not set! Please provide a comma-delimited list of web service endpoints."
  exit 1
fi

if [ -z "$LANGUAGE" ]; then
  echo "LANGUAGE is not set! Please provide the programming language (e.g., node, python)."
  exit 1
fi

if [ -z "$APPPORT" ]; then
  echo "APPPORT is not set! Please provide the port that the web service runs on."
  exit 1
fi

# Install dependencies based on the LANGUAGE environment variable
WORKSPACE="/opt/src"

install_dependencies() {  
  case "$LANGUAGE" in
    node)
      if [ -f "$WORKSPACE/package.json" ]; then
        echo "Installing Node.js dependencies from package.json..."
        npm install --prefix "$WORKSPACE"
      else
        echo "package.json not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    python)
      if [ -f "$WORKSPACE/requirements.txt" ]; then
        echo "Installing Python dependencies from requirements.txt..."
        pip install -r "$WORKSPACE/requirements.txt"
      else
        echo "requirements.txt not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    ruby)
      if [ -f "$WORKSPACE/Gemfile" ]; then
        echo "Installing Ruby dependencies from Gemfile..."
        bundle install --gemfile="$WORKSPACE/Gemfile"
      else
        echo "Gemfile not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    go)
      if [ -f "$WORKSPACE/go.mod" ]; then
        echo "Installing Go dependencies from go.mod..."
        go mod tidy -modfile="$WORKSPACE/go.mod"
      else
        echo "go.mod not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    java)
      if [ -f "$WORKSPACE/pom.xml" ]; then
        echo "Installing Java dependencies from pom.xml (Maven)..."
        mvn -f "$WORKSPACE/pom.xml" install
      elif [ -f "$WORKSPACE/build.gradle" ]; then
        echo "Installing Java dependencies from build.gradle (Gradle)..."
        gradle -b "$WORKSPACE/build.gradle" build
      else
        echo "Neither pom.xml nor build.gradle found in $WORKSPACE! Please ensure one exists to install dependencies."
        exit 1
      fi
      ;;
    php)
      if [ -f "$WORKSPACE/composer.json" ]; then
        echo "Installing PHP dependencies from composer.json..."
        composer install --working-dir="$WORKSPACE"
      else
        echo "composer.json not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    *)
      echo "Unsupported language: $LANGUAGE. Supported options are 'node', 'python', 'ruby', 'go', 'java', 'php'."
      exit 1
      ;;
  esac
}

echo "Changing to WORKSPACE directory: $WORKSPACE"
cd "$WORKSPACE" || { echo "Failed to change to WORKSPACE directory. Exiting."; exit 1; }

# Install dependencies
install_dependencies

# Start the web service
echo "Starting the web service with command: $EXECMD"
$EXECMD &
SERVICE_PID=$!

# Give the service a few seconds to initialize
sleep 5

# Track CPU and RAM usage of the service
CPU_RAM_LOG="/opt/src/.reposhield/report"
echo "Monitoring CPU and RAM usage for process ID $SERVICE_PID..." > "$CPU_RAM_LOG"
ps -p $SERVICE_PID -o %cpu,%mem,cmd >> "$CPU_RAM_LOG"

# Check if the service is running, if not, exit the script
if ! ps -p $SERVICE_PID > /dev/null; then
  echo "Service is not running. Exiting..." >> "$CPU_RAM_LOG"
  exit 1
fi

# Function to run the fuzzing tests on the endpoints
run_fuzzers() {
  local endpoints=$1
  local report_file=$2
  local found_issues=false

  echo -e "\nRunning fuzzers on endpoints..." >> "$report_file"

  # Iterate through each endpoint and simulate fuzzing
  IFS=',' read -r -a endpoint_array <<< "$endpoints"
  for endpoint in "\${endpoint_array[@]}"; do
    # Create the full URL using the APPPORT and the endpoint
    FULL_URL="http://localhost:\${APPPORT}/\${endpoint}"
    
    echo -e "Fuzzing endpoint: $FULL_URL" >> "$report_file"

    # Basic fuzzing logic (just random characters for this demo)
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$FULL_URL" -d "@<(echo $RANDOM)" -X POST)
    
    # You could add more detailed checks here to look for crashes or vulnerabilities
    if [[ "$RESPONSE" -eq 500 || "$RESPONSE" -eq 400 ]]; then
      echo "Potential issue or crash found at endpoint: $FULL_URL (HTTP $RESPONSE)" >> "$report_file"
      found_issues=true
    else
      echo "No issues found at endpoint: $FULL_URL" >> "$report_file"
    fi
  done

  # If no issues are found, log that information
  if [ "$found_issues" = false ]; then
    echo "nothing found" >> "$report_file"
  fi
}

# Run fuzzing tests on the given endpoints
run_fuzzers "$ENDPOINTS" "$CPU_RAM_LOG"

# Wait for the service to finish running (optional, you can stop it after a certain timeout)
sleep 3
kill -9 $SERVICE_PID

echo "Web service has finished. Fuzzer results and resource usage can be found in $CPU_RAM_LOG"`;

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
		await writeFile(path.join(reposhieldPath, 'analyze.sh'), ANALYZE_SH_CONTENT);
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
