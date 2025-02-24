import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

let OVERWRITE_FLAG = false;
let SANDBOX_CONTAINER_NAME = 'reposhield-sandbox';
let CODEQL_CONTAINER_NAME = 'reposhield-codeql';

export async function executeCommand(
    command: string,
    description: string,
    cwd = '.',
): Promise<number> {
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

        const exitCode: number = await new Promise((resolve, reject) => {
            result.on('close', resolve);
        });

        // void logger.log('Run command succeeded.');
        return exitCode;
    } catch (err: any) {
        let error = new Error(`${description} failed: ${err.stderr || err}`);
        console.error(`${error.name}: ${error.message}`);
        throw error;
    }
}


export async function cleanDockerContainer() {
    let command =  `docker rm -f ${SANDBOX_CONTAINER_NAME}`;

    await executeCommand(command, 'Clean up docker container');
}

export async function codeqlScan(): Promise<boolean> {
    // let dockerPath = await projectConfiguration.getDockerPath();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let command = `docker build -t ${CODEQL_CONTAINER_NAME} .`;
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    let codeqlPath = path.join(reposhieldPath, 'codeql');

    await executeCommand(command, 'Building codeql docker container', codeqlPath);
  
    command = `docker run --rm --name ${CODEQL_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" -e "COMMAND=build" -e --overwrite -e "OVERWRITE_FLAG=--overwrite" -e "SAVE_CACHE_FLAG=--save-cache" -e "THREADS=4" -e "LANGUAGE=python" ${CODEQL_CONTAINER_NAME}`;

    await executeCommand(command, 'Codeql scan', codeqlPath);

    return true;
}

export async function runSandbox(): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let command = `docker build -t ${SANDBOX_CONTAINER_NAME} .`;
    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    let sandboxPath = path.join(reposhieldPath, 'sandbox');

    await executeCommand(command, 'Building sandbox docker container', sandboxPath);
    let envs = [];
    // Hardcoded for now for testing
    envs.push(
        `-e "EXECMD=python app.py"`,
        `-e "APPPORT=5000"`,
        `-e "ENDPOINTS=getrace,racetrack,dist,gimmeflag,test"`,
        `-e "LANGUAGE=python"`,
    );
    const envString = envs.join(' ');

    command = `docker run --rm --name ${SANDBOX_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" ${envString} ${SANDBOX_CONTAINER_NAME}`;
    await executeCommand(command, 'Running docker container', sandboxPath);

    return true;
}

export async function runNucleiDocker(templateDirectory: string, targetPort: string): Promise<boolean> {
    let command = `docker pull projectdiscovery/nuclei:latest`;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield')

    await executeCommand(command, 'Pulling docker container', reposhieldPath);

    // command = `docker run -v "${templateDirectory}:/app/" projectdiscovery/nuclei -jsonl /app/results.jsonl -u http://127.0.0.1:${targetPort} -t /app/templates/`;
    command = `docker run projectdiscovery/nuclei:latest -u http://127.0.0.1:${targetPort}`;
    await executeCommand(command, 'Running docker container', reposhieldPath);

    return true;
}
