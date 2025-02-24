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
exports.executeCommand = executeCommand;
exports.cleanCodeqlContainer = cleanCodeqlContainer;
exports.cleanSandboxContainer = cleanSandboxContainer;
exports.cleanNucleiContainer = cleanNucleiContainer;
exports.buildContainers = buildContainers;
exports.codeqlScan = codeqlScan;
exports.runSandbox = runSandbox;
exports.runNucleiDocker = runNucleiDocker;
const cp = __importStar(require("child_process"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
let OVERWRITE_FLAG = false;
let SANDBOX_CONTAINER_NAME = 'reposhield-sandbox';
let CODEQL_CONTAINER_NAME = 'reposhield-codeql';
async function executeCommand(command, description, cwd = '.') {
    // Add logging arguments first, in case commandArgs contains positional parameters.
    // const args = command.concat(commandArgs);
    try {
        void console.log(`Cmd running ${description}: "${command}"...`);
        // const result = await promisify(child_process.execFile)(commandPath, args, {shell: true});
        const result = cp.exec(command, { cwd: cwd });
        result.stdout?.on('data', function (data) {
            console.log(data);
        });
        result.stderr?.on('data', function (data) {
            console.error(data);
        });
        const exitCode = await new Promise((resolve, reject) => {
            result.on('close', resolve);
        });
        // void logger.log('Run command succeeded.');
        return exitCode;
    }
    catch (err) {
        let error = new Error(`${description} failed: ${err.stderr || err}`);
        console.error(`${error.name}: ${error.message}`);
        throw error;
    }
}
async function cleanCodeqlContainer() {
    let command = `docker rm -f ${CODEQL_CONTAINER_NAME}`;
    await executeCommand(command, 'Cleaned up codeql docker container');
}
async function cleanSandboxContainer() {
    let command = `docker rm -f ${SANDBOX_CONTAINER_NAME}`;
    await executeCommand(command, 'Cleaned up sandbox docker container');
}
async function cleanNucleiContainer() {
    let command = `docker rm -f projectdiscovery/nuclei`;
    await executeCommand(command, 'Cleaned up nuclei docker container');
}
async function buildContainers() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    let codeqlPath = path.join(reposhieldPath, 'codeql');
    let sandboxPath = path.join(reposhieldPath, 'sandbox');
    let nucleiPath = path.join(reposhieldPath, 'nuclei');
    let command = `docker build -t ${SANDBOX_CONTAINER_NAME} .`;
    await executeCommand(command, 'Building sandbox docker container', sandboxPath);
    command = `docker build -t ${CODEQL_CONTAINER_NAME} .`;
    await executeCommand(command, 'Building codeql docker container', codeqlPath);
    command = `docker pull projectdiscovery/nuclei:latest`;
    await executeCommand(command, 'Pulling nuclei docker container', nucleiPath);
    return true;
}
async function codeqlScan() {
    // let dockerPath = await projectConfiguration.getDockerPath();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    let codeqlPath = path.join(reposhieldPath, 'codeql');
    let command = `docker run --rm --name ${CODEQL_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" -e "COMMAND=build" -e --overwrite -e "OVERWRITE_FLAG=--overwrite" -e "SAVE_CACHE_FLAG=--save-cache" -e "THREADS=4" -e "LANGUAGE=python" ${CODEQL_CONTAINER_NAME}`;
    // let command = `docker run --name ${CODEQL_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" -e "COMMAND=build" -e "USERID=1000" -e "GROUPID=1000" -e --overwrite -e "OVERWRITE_FLAG=--overwrite" -e "SAVE_CACHE_FLAG=--save-cache" -e "THREADS=4" -e "LANGUAGE=python" ${CODEQL_CONTAINER_NAME}`;
    await executeCommand(command, 'Codeql scan', codeqlPath);
    return true;
}
async function runSandbox() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    let sandboxPath = path.join(reposhieldPath, 'sandbox');
    let envs = [];
    // Hardcoded for now for testing
    envs.push(`-e "EXECMD=python app.py"`, `-e "APPPORT=5000"`, `-e "ENDPOINTS=getrace,racetrack,dist,gimmeflag,test"`, `-e "LANGUAGE=python"`);
    const envString = envs.join(' ');
    let command = `docker run --rm --name ${SANDBOX_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" ${envString} ${SANDBOX_CONTAINER_NAME}`;
    await executeCommand(command, 'Running docker container', sandboxPath);
    return true;
}
async function runNucleiDocker(composeDirectory, templateDirectory, targetPort) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    // command = `docker run -v "${templateDirectory}:/app/" projectdiscovery/nuclei -jsonl /app/results.jsonl -u http://127.0.0.1:${targetPort} -t /app/templates/`;
    // command = `docker run projectdiscovery/nuclei:latest -u http://127.0.0.1:${targetPort}`;
    // modify docker-compose.yaml to specify workspace folder
    // replace ||workspaceFolder|| with workspace folder path
    const composeFile = path.join(composeDirectory, 'docker-compose.yaml');
    let composeContent = await vscode.workspace.fs.readFile(vscode.Uri.file(composeFile));
    let composeString = new TextDecoder().decode(composeContent);
    composeString = composeString.replace('||workspaceFolder||', workspaceFolder.uri.fsPath);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(composeFile), new TextEncoder().encode(composeString));
    let command = `docker-compose up --build`;
    await executeCommand(command, 'Running docker container', composeDirectory);
    return true;
}
//# sourceMappingURL=cmd.js.map