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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
// console.log(getConfigValue("reposhield", "APIKey"));
const genAI = new generative_ai_1.GoogleGenerativeAI(getConfigValue("reposhield", "APIKey"));
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// This method is called when your extension is activated
async function activate(context) {
    console.log("RepoShield extension is now active!");
    const SANDBOX_DOCKER_CONTENT = readInternalFile(context, "sandbox/Dockerfile");
    const SANDBOX_ANALYZE_CONTENT = readInternalFile(context, "sandbox/analyze.sh");
    const CODEQL_DOCKER_CONTENT = readInternalFile(context, "codeql/Dockerfile");
    const CODEQL_ANALYZE_CONTENT = readInternalFile(context, "codeql/analyze.sh");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
    }
    const reposhieldPath = path.join(workspaceFolder.uri.fsPath, ".reposhield");
    // Define the path for the CodeQL database
    const sandboxFolder = path.join(reposhieldPath, "sandbox");
    const codeqlFolder = path.join(reposhieldPath, "codeql");
    if (!fs.existsSync(reposhieldPath)) {
        fs.mkdirSync(sandboxFolder, { recursive: true });
        fs.mkdirSync(codeqlFolder, { recursive: true });
        await writeFile(path.join(sandboxFolder, "Dockerfile"), SANDBOX_DOCKER_CONTENT);
        await writeFile(path.join(sandboxFolder, "analyze.sh"), SANDBOX_ANALYZE_CONTENT);
        await writeFile(path.join(codeqlFolder, "Dockerfile"), CODEQL_DOCKER_CONTENT);
        await writeFile(path.join(codeqlFolder, "analyze.sh"), CODEQL_ANALYZE_CONTENT);
        vscode.window.showInformationMessage('Created "codeql-database" directory in the workspace.');
    }
    // Build containers
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Building containers...`,
        cancellable: true
    }, async (progress, token) => {
        token.onCancellationRequested(() => {
            (0, cmd_1.cleanCodeqlContainer)();
            (0, cmd_1.cleanNucleiContainer)();
            (0, cmd_1.cleanSandboxContainer)();
            console.log("User cancelled the long running operation");
        });
        await (0, cmd_1.buildContainers)();
        vscode.window.showInformationMessage("Containers built!");
    });
    // Register the command to scan the whole workspace/folder
    const disposableFolderScan = vscode.commands.registerCommand("reposhield.scanWorkspace", async () => {
        try {
            const endpoints = await extractEndpoints();
            // write endpoints to a json file
            fs.writeFileSync(path.join(reposhieldPath, "endpoints.json"), JSON.stringify(endpoints, null, 2));
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Scanning workspace: ${workspaceFolder.uri.fsPath}...`,
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    (0, cmd_1.cleanCodeqlContainer)();
                    console.log("User cancelled the long running operation");
                });
                await (0, cmd_1.codeqlScan)();
                let resultPath = path.join(reposhieldPath, 'results.sarif');
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
                (0, cmd_1.cleanSandboxContainer)();
                console.log("User cancelled the long running operation");
            });
            await (0, cmd_1.runSandbox)();
            vscode.window.showInformationMessage("Scanning completed!");
        });
    });
    const disposableNuclei = vscode.commands.registerCommand("reposhield.nuclei", async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Performing dynamic analysis on this workspace...`,
            cancellable: true,
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                (0, cmd_1.cleanNucleiContainer)();
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
    const disposableSettings = vscode.commands.registerCommand('reposhield.settings', async () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'reposhield');
    });
    context.subscriptions.push(disposableDynamic);
    context.subscriptions.push(disposableReadLog);
    context.subscriptions.push(disposableFolderScan);
    context.subscriptions.push(disposableNuclei);
    context.subscriptions.push(disposableSettings);
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
// This method is called when your extension is deactivated
async function deactivate() { }
//# sourceMappingURL=extension.js.map