"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const https = __importStar(require("https"));
const unzipper = __importStar(require("unzipper"));
const os = __importStar(require("os"));
const cmd_1 = require("./cmd");
const generative_ai_1 = require("@google/generative-ai");
const nuclei_1 = require("./nuclei");
function readInternalFile(context, filename) {
    const filePath = path.join(context.extensionPath, "resources", filename);
    return fs.readFileSync(filePath, "utf-8");
}
function getConfigValue(configuration, setting) {
    const config = vscode.workspace.getConfiguration(configuration);
    return config.get(setting, "undefined");
}
async function getPythonFiles() {
    return await vscode.workspace.findFiles("**/*.py", "**/node_modules/**");
}
async function readPythonFiles() {
    const files = await getPythonFiles();
    const fileContents = {};
    for (const file of files) {
        try {
            const content = await vscode.workspace.fs.readFile(file);
            fileContents[file.fsPath] = Buffer.from(content).toString("utf8");
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error reading file ${file.fsPath}: ${error}`);
        }
    }
    return fileContents;
}
async function extractRoutesParams(fileContents) {
    let prompt = "First, discover the port number of the application and output in the format: PORT: 5000\n\n";
    prompt +=
        "Analyse the following files and extract the API paths and parameters\n";
    prompt += "Output in the format: [METHOD] /path/to/endpoint [PARAMS]\n\n";
    prompt += "Strictly do not include any other information or text\n\n";
    prompt += "Example: [GET] /api/v1/users/:id\n\n";
    prompt += "Example: [POST] /api/v1/users [name, email, password]\n\n";
    const sourceCode = Object.values(fileContents).join("\n");
    prompt += `Source code: ${sourceCode}\n\n`;
    const result = await model.generateContent(prompt);
    console.log(result.response.text());
    // regex match PORT: <port>
    const portRegex = /PORT: (\d+)/;
    const portMatch = result.response.text().match(portRegex);
    if (!portMatch) {
        throw new Error("Port number not found");
    }
    const port = portMatch[1];
    const paths = result.response.text().split("\n");
    const routes = [];
    // regex match results into {method, path, params}
    const routeRegex = /\[(GET|POST|PUT|DELETE)\] ([^\s]+) \[([^\]]+)\]/;
    for (const path of paths) {
        const match = path.match(routeRegex);
        if (match) {
            const method = match[1];
            const path = match[2];
            const params = match[3].split(",").map((param) => param.trim());
            routes.push({
                method,
                path,
                params,
            });
        }
    }
    return {
        port,
        routes: routes,
    };
}
async function extractEndpoints() {
    const pythonFiles = await readPythonFiles();
    const routes = await extractRoutesParams(pythonFiles);
    return routes;
}
console.log(getConfigValue("reposhield", "APIKey"));
const genAI = new generative_ai_1.GoogleGenerativeAI(getConfigValue("reposhield", "APIKey"));
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// This method is called when your extension is activated
async function activate(context) {
    console.log("RepoShield extension is now active!");
    const SANDBOX_DOCKER_CONTENT = readInternalFile(context, "sandbox/Dockerfile");
    const SANDBOX_ANALYZE_CONTENT = readInternalFile(context, "sandbox/analyze.sh");
    const CODEQL_DOCKER_CONTENT = readInternalFile(context, "codeql/Dockerfile");
    const CODEQL_ANALYZE_CONTENT = readInternalFile(context, "codeql/analyze.sh");
    let codeqlPath = await getConfigValue("codeQL", "executablePath");
    if (codeqlPath === "undefined") {
        codeqlPath = os.homedir() + "\\codeql";
    }
    const codeqlBinPath = path.join(codeqlPath, "codeql");
    // Check if CodeQL is installed
    await setCodeQLPath(os.homedir() + "\\codeql");
    const codeqlInstalled = await isCodeQLInstalled();
    if (!codeqlInstalled) {
        vscode.window.showInformationMessage("CodeQL is not installed. The extension will now attempt to download and install CodeQL.");
        try {
            const codeqlPath = await downloadCodeQL();
            const platform = process.platform;
            let codeqlexepath;
            if (platform == "win32") {
                codeqlexepath = path.join(codeqlPath, "codeql.exe");
            }
            else {
                codeqlexepath = path.join(codeqlPath, "codeql");
            }
            vscode.window.showInformationMessage(`CodeQL has been installed at: ${codeqlPath}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error downloading CodeQL: ${error.message}`);
            return; // Exit activation if installation fails
        }
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
    }
    const reposhieldPath = path.join(workspaceFolder.uri.fsPath, ".reposhield");
    // Define the path for the CodeQL database
    const databaseFolder = path.join(reposhieldPath, "codeql-database");
    const sandboxFolder = path.join(reposhieldPath, "sandbox");
    const codeqlFolder = path.join(reposhieldPath, "codeql");
    if (!fs.existsSync(reposhieldPath)) {
        fs.mkdirSync(databaseFolder, { recursive: true });
        fs.mkdirSync(sandboxFolder, { recursive: true });
        fs.mkdirSync(codeqlFolder, { recursive: true });
        await writeFile(path.join(sandboxFolder, "Dockerfile"), SANDBOX_DOCKER_CONTENT);
        await writeFile(path.join(sandboxFolder, "analyze.sh"), SANDBOX_ANALYZE_CONTENT);
        await writeFile(path.join(codeqlFolder, "Dockerfile"), CODEQL_DOCKER_CONTENT);
        await writeFile(path.join(codeqlFolder, "analyze.sh"), CODEQL_ANALYZE_CONTENT);
        vscode.window.showInformationMessage('Created "codeql-database" directory in the workspace.');
    }
    // Register the command to scan the whole workspace/folder
    const disposableFolderScan = vscode.commands.registerCommand("reposhield.scanWorkspace", async () => {
        try {
            vscode.window.showInformationMessage("Creating CodeQL database...");
            // write endpoints to a json file
            // fs.writeFileSync(path.join(reposhieldPath, "endpoints.json"), JSON.stringify(endpoints, null, 2));
            const endpoints = await extractEndpoints();
            // write endpoints to a json file
            fs.writeFileSync(path.join(reposhieldPath, "endpoints.json"), JSON.stringify(endpoints, null, 2));
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Scanning workspace: ${workspaceFolder.uri.fsPath}...`,
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    (0, cmd_1.cleanDockerContainer)();
                    console.log("User canceled the long running operation");
                });
                await (0, cmd_1.codeqlScan)();
                let resultPath = path.join(reposhieldPath, 'result.sarif');
                openSarifViewerPannel(resultPath);
                vscode.window.showInformationMessage("Scanning complete");
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });
    const disposableReadLog = vscode.commands.registerCommand("reposhield.readLog", async () => {
        try {
            await openSarifViewerPannel(path.join(reposhieldPath, "results.sarif"));
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });
    const disposableDynamic = vscode.commands.registerCommand("reposhield.dynamicanalysis", async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Performing dynamic analysis on this workspace...`,
            cancellable: true,
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                (0, cmd_1.cleanDockerContainer)();
                console.log("User canceled the long running operation");
            });
            await (0, cmd_1.runDocker)();
            vscode.window.showInformationMessage("Scanning complete");
        });
    });
    const disposableNuclei = vscode.commands.registerCommand("reposhield.nuclei", async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Performing dynamic analysis on this workspace...`,
            cancellable: true,
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                (0, cmd_1.cleanDockerContainer)();
                console.log("User canceled the long running operation");
            });
            const endpoints = JSON.parse(fs.readFileSync(path.join(reposhieldPath, "endpoints.json"), "utf-8"));
            const targetPort = endpoints.port;
            const templateDirectory = path.join(context.extensionPath, "resources", "nuclei", "templates");
            await (0, nuclei_1.generateNucleiTemplates)(templateDirectory, path.join(reposhieldPath, "endpoints.json"));
            await (0, cmd_1.runNucleiDocker)(templateDirectory, targetPort);
            vscode.window.showInformationMessage("Scanning complete");
        });
    });
    context.subscriptions.push(disposableDynamic);
    context.subscriptions.push(disposableReadLog);
    context.subscriptions.push(disposableFolderScan);
    context.subscriptions.push(disposableNuclei);
}
// Run a command using child process
async function analyzeDatabase(databaseFolder, workspaceFolder, reposhieldPath) {
    fs.readFile(path.join(databaseFolder, "baseline-info.json"), "utf8", (err, data) => {
        if (err) {
            console.error("Error reading the file:", err);
            return;
        }
        try {
            const parsedData = JSON.parse(data);
            const languages = Object.keys(parsedData["languages"]);
            let command = `codeql database analyze "${databaseFolder}"`;
            languages.forEach((language) => {
                command += ` codeql/${language}-queries`;
            });
            command += ` --format=sarifv2.1.0 --output="${reposhieldPath}\\results.sarif" --download`;
            vscode.window.showInformationMessage("Analyzing database... (this may take a while)");
            console.log("Command: ", command);
            const analyzeDatabaseProcess = cp.exec(command, {
                cwd: workspaceFolder.uri.fsPath,
            });
            if (analyzeDatabaseProcess !== null &&
                analyzeDatabaseProcess.stdout !== null &&
                analyzeDatabaseProcess.stderr !== null) {
                analyzeDatabaseProcess.stdout.on("data", (data) => {
                    console.log(data);
                });
                analyzeDatabaseProcess.stderr.on("data", (error) => {
                    console.error("Running... (ignore these errors)", error);
                });
                analyzeDatabaseProcess.on("close", async (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage(`CodeQL database analyzed successfully!`);
                        console.log("Opening log");
                        await openSarifViewerPannel(path.join(reposhieldPath, "results.sarif"));
                        console.log("Done Opening log");
                    }
                    else {
                        vscode.window.showErrorMessage(`CodeQL database analysis failed with exit code ${code}`);
                    }
                });
            }
        }
        catch (err) {
            console.error("Error parsing JSON:", err);
            return;
        }
    });
}
async function openSarifViewerPannel(filePath) {
    try {
        const sarifExt = vscode.extensions.getExtension("MS-SarifVSCode.sarif-viewer");
        if (sarifExt === undefined) {
            vscode.window
                .showWarningMessage("Please install 'Sarif Viewer' to view SAST report better.", ...["Install"])
                .then((install) => {
                if (install === "Install") {
                    vscode.commands.executeCommand("workbench.extensions.installExtension", "MS-SarifVSCode.sarif-viewer");
                }
            });
            return false;
        }
        vscode.window.showInformationMessage(`Opening log in Sarif Viewer...`);
        if (!sarifExt.isActive)
            await sarifExt.activate();
        await sarifExt.exports.openLogs([vscode.Uri.file(filePath)]);
    }
    catch (err) {
        console.error("Error parsing JSON:", err);
        return;
    }
    return true;
}
/**
 * Creates a file at the given filePath with the provided content.
 * @param filePath The path where the file should be created.
 * @param fileContent The content to be written to the file.
 */
async function writeFile(filePath, fileContent) {
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
async function isCodeQLInstalled() {
    return new Promise((resolve) => {
        cp.exec("codeql --version", (error) => {
            resolve(!error); // if no error, it means CodeQL is installed
        });
    });
}
async function isNucleiInstalled() {
    return new Promise((resolve) => {
        cp.exec("nuclei -version", (error) => {
            resolve(!error); // if no error, it means Nuclei is installed
        });
    });
}
// Download CodeQL and extract it to a directory
async function downloadCodeQL() {
    const downloadUrl = await getDownloadUrlForPlatform(); // Modify this URL for your platform
    // Use a global directory for CodeQL (e.g., home directory or a dedicated folder like ~/.codeql or C:\CodeQL)
    const globalCodeQLDirectory = os.homedir() + "\\codeql"; // For example, ~\.codeql or /home/user/.codeql
    // Ensure the directory exists
    if (fs.existsSync(globalCodeQLDirectory)) {
        console.log("CodeQL directory already exists.");
        return globalCodeQLDirectory;
    }
    // Follow the redirect and download the file
    return new Promise((resolve, reject) => {
        https
            .get(downloadUrl, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const redirectUrl = res.headers.location;
                console.log(`Redirecting to: ${redirectUrl}`);
                if (redirectUrl) {
                    https
                        .get(redirectUrl, (redirectRes) => {
                        if (redirectRes.statusCode !== 200) {
                            return reject(new Error(`Failed to download CodeQL. Status Code: ${redirectRes.statusCode}`));
                        }
                        // Pipe the file to the extraction location
                        redirectRes
                            .pipe(unzipper.Extract({ path: os.homedir() }))
                            .on("close", async () => {
                            console.log("CodeQL downloaded and extracted.");
                            resolve(globalCodeQLDirectory);
                        })
                            .on("error", async (err) => {
                            console.error("Error during extraction:", err);
                            reject(err);
                        });
                    })
                        .on("error", (err) => {
                        console.error("Error following redirect:", err);
                        reject(err);
                    });
                }
                else {
                    return reject(new Error("Redirect URL is undefined."));
                }
            }
            else if (res.statusCode === 200) {
                // If there's no redirection (direct file download)
                res
                    .pipe(unzipper.Extract({ path: os.homedir() }))
                    .on("close", async () => {
                    console.log("CodeQL downloaded and extracted.");
                    resolve(globalCodeQLDirectory);
                })
                    .on("error", (err) => {
                    console.error("Error during extraction:", err);
                    reject(err);
                });
            }
            else {
                return reject(new Error(`Failed to download CodeQL. Status Code: ${res.statusCode}`));
            }
        })
            .on("error", (err) => {
            console.error("Error during download:", err);
            reject(err);
        });
    });
}
async function setCodeQLPath(codeqlPath) {
    process.env.PATH = `${process.env.PATH}${codeqlPath}`;
}
async function getDownloadUrlForPlatform() {
    const platform = process.platform;
    if (platform === "win32") {
        return "https://github.com/github/codeql-cli-binaries/releases/download/v2.20.4/codeql-win64.zip";
    }
    else if (platform === "darwin") {
        return "https://github.com/github/codeql-cli-binaries/releases/download/v2.20.4/codeql-osx64.zip";
    }
    else if (platform === "linux") {
        return "https://github.com/github/codeql-cli-binaries/releases/download/v2.20.4/codeql-linux64.zip";
    }
    else {
        throw new Error("Unsupported platform");
    }
}
// This method is called when your extension is deactivated
async function deactivate() { }
//# sourceMappingURL=extension.js.map