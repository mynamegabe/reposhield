import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

let OVERWRITE_FLAG = false;
let DOCKER_CONTAINER_NAME = 'reposhield_analysis';

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
    let command =  `docker rm -f ${DOCKER_CONTAINER_NAME}`;

    await executeCommand(command, 'Clean up docker container');
}

export async function runDocker(): Promise<boolean> {
    let command = `docker build -t ${DOCKER_CONTAINER_NAME} .`;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield')

    await executeCommand(command, 'Building docker container', reposhieldPath);
    let envs = [];
    // Hardcoded for now for testing
    envs.push(
        `-e "EXECMD=python app.py"`,
        `-e "APPPORT=5000"`,
        `-e "ENDPOINTS=getrace,racetrack,dist,gimmeflag,test"`,
        `-e "LANGUAGE=python"`,
    );
    const envString = envs.join(' ');

    command = `docker run --rm --name ${DOCKER_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" ${envString} ${DOCKER_CONTAINER_NAME}`;
    await executeCommand(command, 'Running docker container', reposhieldPath);

    return true;
}
