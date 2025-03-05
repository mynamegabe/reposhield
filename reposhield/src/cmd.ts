import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { TimeoutError } from 'puppeteer';

let OVERWRITE_FLAG = false;
let SANDBOX_CONTAINER_NAME = 'reposhield-sandbox';
let CODEQL_CONTAINER_NAME = 'reposhield-codeql';

export async function executeCommand(
    command: string,
    description: string,
    cwd = '.',
): Promise<any> {
    // Add logging arguments first, in case commandArgs contains positional parameters.
    // const args = command.concat(commandArgs);
    try {
        void console.log(`Cmd running ${description}: "${command}"...`);
        // const result = await promisify(child_process.execFile)(commandPath, args, {shell: true});
        let output = "";
        const result = cp.exec(command, { cwd: cwd });
        result.stdout?.on('data', function (data) {
            console.log(data);
            output = data;
        });
        result.stderr?.on('data', function (data) {
            console.error(data);
        });

        const exitCode: number = await new Promise((resolve, reject) => {
            result.on('close', resolve);
        });

        // void logger.log('Run command succeeded.');
        return output ? output : exitCode;
    } catch (err: any) {
        let error = new Error(`${description} failed: ${err.stderr || err}`);
        console.error(`${error.name}: ${error.message}`);
        throw error;
    }
}


export async function cleanCodeqlContainer() {
    let command = `docker rm -f ${CODEQL_CONTAINER_NAME}`;

    await executeCommand(command, 'Cleaned up codeql docker container');
}

export async function cleanSandboxContainer() {
    let command = `docker rm -f ${SANDBOX_CONTAINER_NAME}`;

    await executeCommand(command, 'Cleaned up sandbox docker container');
}

export async function cleanNucleiContainer() {
    let command = `docker rm -f projectdiscovery/nuclei`;

    await executeCommand(command, 'Cleaned up nuclei docker container');
}

export async function buildContainers(context: vscode.ExtensionContext): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');
    let codeqlPath = path.join(context.extensionPath, "resources", "codeql");
    let sandboxPath = path.join(context.extensionPath, "resources", "sandbox");

    let command = `docker build -t ${SANDBOX_CONTAINER_NAME} .`;
    await executeCommand(command, 'Building sandbox docker container', sandboxPath);

    command = `docker build -t ${CODEQL_CONTAINER_NAME} .`;
    await executeCommand(command, 'Building codeql docker container', codeqlPath);

    command = `docker pull projectdiscovery/nuclei:latest`;
    await executeCommand(command, 'Pulling nuclei docker container', reposhieldPath);

    return true;
}

export async function codeqlScan(): Promise<boolean> {
    // let dockerPath = await projectConfiguration.getDockerPath();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');

    let command = `docker run --rm --name ${CODEQL_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" -e "COMMAND=build" -e --overwrite -e "OVERWRITE_FLAG=--overwrite" -e "SAVE_CACHE_FLAG=--save-cache" -e "THREADS=4" -e "LANGUAGE=python" ${CODEQL_CONTAINER_NAME}`;
    // let command = `docker run --name ${CODEQL_CONTAINER_NAME} -v "${workspaceFolder.uri.fsPath}:/opt/src" -e "COMMAND=build" -e "USERID=1000" -e "GROUPID=1000" -e --overwrite -e "OVERWRITE_FLAG=--overwrite" -e "SAVE_CACHE_FLAG=--save-cache" -e "THREADS=4" -e "LANGUAGE=python" ${CODEQL_CONTAINER_NAME}`;

    await executeCommand(command, 'Codeql scan', reposhieldPath);

    return true;
}

export async function runSandbox(endpoints: any): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield');

    let envs = [];
    // Hardcoded for now for testing
    envs.push(
        `-e "EXECMD=python3 app.py"`,
        `-e "APPPORT=${endpoints.port}"`,
        `-e "LANGUAGE=python"`,
    );
    const envString = envs.join(' ');

    let command = `docker run --rm --name ${SANDBOX_CONTAINER_NAME} -p 49153:${endpoints.port} -v "${workspaceFolder.uri.fsPath}:/opt/src" ${envString} ${SANDBOX_CONTAINER_NAME}`;
    let get_routes: any[] = [];  // Initialize an empty array to store GET routes

    if (endpoints.routes && Array.isArray(endpoints.routes)) {
        for (const route of endpoints.routes) {
            if (route.method === 'GET') {
                get_routes.push(route);
            }
        }
    }

    if (get_routes.length > 0) {
        executeCommand(command, 'Running docker container', reposhieldPath);
        let running = await executeCommand("docker ps -q --filter name=reposhield-sandbox", 'Getting container id', reposhieldPath);
        console.log(`Running: ${running}`);
        while (!running) {
            await sleep(1000);
            console.log(`Running: ${running}`);

            running = executeCommand("docker ps -q --filter name=reposhield-sandbox", 'Getting container id', reposhieldPath);
        };
        await unitTest(reposhieldPath, get_routes);
    } else {
        await executeCommand(command, 'Running docker container', reposhieldPath);
    }

    await cleanSandboxContainer();

    return true;
}

export async function runNucleiDocker(resourceDirectory: string, templateDirectory: string, targetPort: string): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }

    // let reposhieldPath = path.join(workspaceFolder.uri.fsPath, '.reposhield')

    // command = `docker run -v "${templateDirectory}:/app/" projectdiscovery/nuclei -jsonl /app/results.jsonl -u http://127.0.0.1:${targetPort} -t /app/templates/`;
    // command = `docker run projectdiscovery/nuclei:latest -u http://127.0.0.1:${targetPort}`;

    // modify docker-compose.yaml to specify workspace folder
    // replace ||workspaceFolder|| with workspace folder path
    const baseComposeFile = path.join(resourceDirectory, 'docker-compose-base.yaml');
    let composeContent = await vscode.workspace.fs.readFile(vscode.Uri.file(baseComposeFile));
    let composeString = new TextDecoder().decode(composeContent);
    composeString = composeString.replace('||workspaceFolder||', workspaceFolder.uri.fsPath);
    // replace ||templateFolder|| with resourceDirectory/nuclei/templates
    composeString = composeString.replace('||templateFolder||', path.join(resourceDirectory, 'nuclei/templates'));
    composeString = composeString.replace('||payloadsFolder||', path.join(resourceDirectory, 'nuclei/payloads'));

    
    const composeFile = path.join(resourceDirectory, 'docker-compose.yaml');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(composeFile), Buffer.from(composeString));
    


    let command = `docker-compose up --build`;
    await executeCommand(command, 'Running docker container', resourceDirectory);

    return true;
}

export async function unitTest(reposhieldPath: string, get_routes: any[]): Promise<boolean> {
    const browser = await puppeteer.launch({
        headless: true,  // Run the browser in headless mode (no UI)
        slowMo: 50       // Slow down actions to simulate human behavior
    });

    const baseUrl = `http://localhost:49153`;

    const page = await browser.newPage();

    // Sanity check to verify if the application is up
    while (true) {
        try {
            console.log(`Checking if the web application is up at ${baseUrl}`);
            let running = await executeCommand("docker ps -q --filter name=reposhield-sandbox", 'Getting container id', reposhieldPath);
            if (!running) {
                console.error('Docker container is not running, exiting...');
                return false;
            }
            await page.goto(baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 5000  // Timeout after 5 seconds
            });
            console.log('Web application is up!');
            break;
        } catch (error: any) {
            if (error instanceof TimeoutError) {
                console.log(`Timeout occurred while checking ${baseUrl}. Retrying...`);
                await sleep(5000);
            } else if (error.message.includes('ERR_CONNECTION_REFUSED') || error.message.includes('ERR_EMPTY_RESPONSE')) {
                console.error(`Error connecting to ${baseUrl}, trying again...`);
                await sleep(5000);
            } else {
                console.error(`Error checking ${baseUrl}:`, error);
                vscode.window.showErrorMessage(`Error checking ${baseUrl}: ${error.message}`);
                return false;
            }
        }
    }

    for (const route of get_routes) {
        let url = `${baseUrl}${route.path}`;
        try {
            console.log(`Visiting: ${url}`);
            // Navigate to the URL with a timeout option (e.g., 10 seconds)
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 5000  // Timeout after 5 seconds
            });

            // Optionally, simulate scrolling
            // await page.evaluate(async () => {
            //     await page.evaluate(() => {
            //         await page.evaluate(() => {
            //             await page.evaluate(() => {
            //                 window.scrollBy(0, window.innerHeight);  // Simulate scrolling
            //             });
            //         });
            //     });
            // });

        } catch (error: any) {
            // console.error(`Error visiting ${url}:`, error);
        }
    }

    // Close the browser after visiting all URLs
    await browser.close();
    
    return true;
}

export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
