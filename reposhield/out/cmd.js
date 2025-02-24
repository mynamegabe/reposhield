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
exports.cleanDockerContainer = cleanDockerContainer;
exports.runDocker = runDocker;
exports.runNucleiDocker = runNucleiDocker;
const cp = __importStar(require("child_process"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
let OVERWRITE_FLAG = false;
let DOCKER_CONTAINER_NAME = 'reposhield_analysis';
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
async function cleanDockerContainer() {
    let command = `docker rm -f ${DOCKER_CONTAINER_NAME}`;
    await executeCommand(command, 'Clean up docker container');
}
async function runDocker() {
    let command = `docker build -t ${DOCKER_CONTAINER_NAME} .`;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    await executeCommand(command, 'Building docker container', reposhieldPath);
    let envs = [];
    // Hardcoded for now for testing
    envs.push(`-e "EXECMD=python app.py"`, `-e "APPPORT=5000"`, `-e "ENDPOINTS=getrace,racetrack,dist,gimmeflag,test"`, `-e "LANGUAGE=python"`);
    const envString = envs.join(' ');
    command = `docker run --rm --name ${DOCKER_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" ${envString} ${DOCKER_CONTAINER_NAME}`;
    await executeCommand(command, 'Running docker container', reposhieldPath);
    return true;
}
async function runNucleiDocker(templateDirectory, targetPort) {
    let command = `docker pull projectdiscovery/nuclei:latest`;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    await executeCommand(command, 'Pulling docker container', reposhieldPath);
    command = `docker run -v "${templateDirectory}:/app/" projectdiscovery/nuclei -jsonl /app/results.jsonl -u http://127.0.0.1:${targetPort} -t /app/templates/`;
    await executeCommand(command, 'Running docker containernee', reposhieldPath);
    return true;
}
//# sourceMappingURL=cmd.js.map