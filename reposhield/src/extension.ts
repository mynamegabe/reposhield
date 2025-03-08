import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";
import * as unzipper from "unzipper";
import * as os from "os";
import { runSandbox, cleanCodeqlContainer, cleanSandboxContainer, runNucleiDocker, executeCommand, codeqlScan, cleanNucleiContainer, buildContainers, semgrepScan, formatLogs } from "./cmd";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateNucleiTemplates } from "./nuclei";

function readInternalFile(context: vscode.ExtensionContext, filename: string) {
  const filePath = path.join(context.extensionPath, "resources", filename);
  return fs.readFileSync(filePath, "utf-8");
}

function getConfigValue(configuration: string, setting: string): string {
  const config = vscode.workspace.getConfiguration(configuration);
  return config.get<string>(setting, "undefined");
}

async function getPythonFiles(): Promise<vscode.Uri[]> {
  return await vscode.workspace.findFiles("**/*.py", "**/node_modules/**");
}

async function readPythonFiles(): Promise<{ [fileName: string]: string }> {
  const files = await getPythonFiles();
  const fileContents: { [fileName: string]: string } = {};

  for (const file of files) {
    try {
      const content = await vscode.workspace.fs.readFile(file);
      fileContents[file.fsPath] = Buffer.from(content).toString("utf8");
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error reading file ${file.fsPath}: ${error}`
      );
    }
  }
  return fileContents;
}

async function extractRoutesParams(fileContents: {
  [fileName: string]: string;
}): Promise<{
  port: string;
  routes: { method: string; path: string; params: string[] }[];
}> {
  let prompt =
    "First, discover the port number of the application and output in the format: PORT: 5000\n\n";
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
  const routes: { method: string; path: string; params: string[] }[] = [];
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

async function extractEndpoints(): Promise<{
  port: string;
  routes: { method: string; path: string; params: string[] }[];
}> {
  const pythonFiles = await readPythonFiles();
  const routes = await extractRoutesParams(pythonFiles);
  return routes;
}

// console.log(getConfigValue("reposhield", "APIKey"));
const genAI = new GoogleGenerativeAI(getConfigValue("reposhield", "APIKey"));
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  console.log("RepoShield extension is now active!");

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return;
  }

  const reposhieldPath = path.join(workspaceFolder.uri.fsPath, ".reposhield");

  if (!fs.existsSync(reposhieldPath)) {
    fs.mkdirSync(reposhieldPath, { recursive: true });
    vscode.window.showInformationMessage(
      'Created ".reposhield" directory in the workspace.'
    );
  }

  // Build containers
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Building containers...`,
    cancellable: true
  }, async (progress, token) => {
    token.onCancellationRequested(() => {
      cleanCodeqlContainer();
      cleanNucleiContainer();
      cleanSandboxContainer();
      console.log("User cancelled the long running operation");
    });
    await buildContainers(context);
    vscode.window.showInformationMessage("Containers built!");
  });

  // Register the command to scan the whole workspace/folder
  const disposableFolderScan = vscode.commands.registerCommand(
    "reposhield.scanWorkspace",
    async () => {
      try {
        const endpoints = await extractEndpoints();
        // Write endpoints to a json file
        fs.writeFileSync(
          path.join(reposhieldPath, "endpoints.json"),
          JSON.stringify(endpoints, null, 2)
        );

        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Scanning workspace: ${workspaceFolder.uri.fsPath}...`,
          cancellable: true
        }, async (progress, token) => {
          token.onCancellationRequested(() => {
            cleanCodeqlContainer();
            cleanNucleiContainer();
            cleanSandboxContainer();
            console.log("User cancelled the long running operation");
          });

          // Run CodeQL scan
          await codeqlScan();
          let resultPath = path.join(reposhieldPath, 'codeql', 'results.sarif');
          openSarifViewerPannel(resultPath);

          // Run Semgrep scan (add Semgrep scan)
          await semgrepScan();
          // Define path for Semgrep results
          let semgrepResultsPath = path.join(reposhieldPath, 'semgrep', 'semgrep-results.sarif');
          // Open the Semgrep results in the viewer
          // openSemgrepResultsPanel(semgrepResultsPath);
          openSarifViewerPannel(semgrepResultsPath);

          vscode.window.showInformationMessage("Scanning complete");
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );


  const disposableReadLog = vscode.commands.registerCommand(
    "reposhield.readLog",
    async () => {
      try {
        await openSarifViewerPannel(path.join(reposhieldPath, "results.sarif"));
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );

  const disposableDynamic = vscode.commands.registerCommand(
    "reposhield.dynamicanalysis",
    async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Performing dynamic analysis on this workspace...`,
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            cleanSandboxContainer();
            console.log("User cancelled the long running operation");
          });
          const endpoints = JSON.parse(
            fs.readFileSync(
              path.join(reposhieldPath, "endpoints.json"),
              "utf-8"
            )
          );
          // const endpoints = await extractEndpoints();
          // Write endpoints to a json file
          // fs.writeFileSync(
          //   path.join(reposhieldPath, "endpoints.json"),
          //   JSON.stringify(endpoints, null, 2)
          // );
          await runSandbox(context, endpoints);
          vscode.window.showInformationMessage("Scanning completed!");
        }
      );
    }
  );

  const disposableDiffProcesses = vscode.commands.registerCommand(
    "reposhield.processesdiff",
    async () => {
      // await formatLogs(reposhieldPath);
      const uri1 = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ".reposhield", "sandbox", "processes.txt"));
      const uri2 = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ".reposhield", "sandbox", "processes.txt.bak"));
      vscode.commands.executeCommand('vscode.diff', uri1, uri2, 'Process Diff Viewer').then(() => {
      }, (err) => {
        vscode.window.showErrorMessage('No files to compare. Make sure you have a new and old log from starting dynamic scans.');
      });
    }
  );

  const disposableDiffFilesystem = vscode.commands.registerCommand(
    "reposhield.filesystemdiff",
    async () => {
      const uri1 = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ".reposhield", "sandbox", "watcher.log"));
      const uri2 = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ".reposhield", "sandbox", "watcher.log.bak"));
      vscode.commands.executeCommand('vscode.diff', uri1, uri2, 'Filesystem Diff Viewer').then(() => {
      }, (err) => {
        vscode.window.showErrorMessage('No files to compare. Make sure you have a new and old log from starting dynamic scans.');
      });
    }
  );

  const disposableNuclei = vscode.commands.registerCommand(
    "reposhield.nuclei",
    async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Performing dynamic analysis on this workspace...`,
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            cleanNucleiContainer();
            console.log("User canceled the long running operation");
          });

          if (!fs.existsSync(path.join(reposhieldPath, "endpoints.json"))) {
            vscode.window.showErrorMessage(
              "Please run 'Scan Workspace' command first."
            );
            return;
          }
          const endpoints = JSON.parse(
            fs.readFileSync(
              path.join(reposhieldPath, "endpoints.json"),
              "utf-8"
            )
          );
          const targetPort = endpoints.port;
          const templateDirectory = path.join(
            context.extensionPath,
            "resources",
            "nuclei",
            "templates"
          );

          await generateNucleiTemplates(
            templateDirectory,
            path.join(reposhieldPath, "endpoints.json")
          );

          const composeDirectory = path.join(context.extensionPath, "resources");

          console.log("Running Nuclei scan...");
          await runNucleiDocker(composeDirectory, templateDirectory, targetPort);
          console.log("Nuclei scan completed!");

          fs.readFile(path.join(workspaceFolder.uri.fsPath, '.reposhield', 'nuclei', 'results.txt'),
            'utf8', (err, data) => {
            if (err) {
              console.error('Error reading results.txt:', err);
              return;
            }

            // Regular expression to match the param value
            const paramRegex = /param="(.*?)"/;

            // Regular expression to match the injection value, if it exists
            const injectionRegex = /injection="(.*?)"/;

            // Parse the results from the file
            const results = data.split('\n').filter(line => line.trim() !== '').map(line => {
              // Split the line by spaces (this assumes all fields are space-separated)
              const parts = line.split(' ');

              // Ensure the line has at least the required parts
              if (parts.length < 5) return null;

              const ruleId = parts[0].slice(1, -1);  // Remove the square brackets from the rule-id
              const protocol = parts[1].slice(1, -1); // Remove the square brackets from the protocol
              const severity = parts[2].slice(1, -1); // Remove the square brackets from the severity
              const url = parts[3];  // URL is the fourth segment in the line
              const lastSegment = parts.slice(4).join(' ');  // The rest of the line after the URL

              // Extract param value using the paramRegex
              const paramMatch = lastSegment.match(paramRegex);
              const param = paramMatch ? paramMatch[1] : "unknown";  // If param is found, use it, otherwise "unknown"

              // Extract injection value using the injectionRegex if it exists
              const injectionMatch = lastSegment.match(injectionRegex);
              const injection = injectionMatch ? injectionMatch[1] : "None";  // Default to "None" if injection is not present

              // Constructing the SARIF result
              return {
                ruleId,
                message: {
                  text: `${ruleId} vulnerability detected on ${url}`
                },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: {
                        uri: url
                      },
                      region: {
                        startLine: 1, // Line numbers are not present in the txt file, so using a placeholder
                        startColumn: 1
                      }
                    }
                  }
                ],
                severity,
                properties: {
                  param,
                  injection
                }
              };
            }).filter(result => result !== null);  // Remove null entries if regex does not match

            // Construct the SARIF structure
            const sarif = {
              "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/v2.1.0/schemas/sarif-schema-2.1.0.json",
              "version": "2.1.0",
              "runs": [
                {
                  "tool": {
                    "driver": {
                      "name": "Nuclei",
                      "version": "1.0.0",
                      "informationUri": "https://github.com/projectdiscovery/nuclei"
                    }
                  },
                  "results": results
                }
              ]
            };

            // Write the SARIF output to results.sarif
            fs.writeFile(path.join(workspaceFolder.uri.fsPath, '.reposhield', 'nuclei', 'results.sarif'),
              JSON.stringify(sarif, null, 2), (err) => {
              if (err) {
                console.error('Error writing results.sarif:', err);
                return;
              }
              console.log('SARIF file saved as results.sarif');
            });
          });

          vscode.window.showInformationMessage("Scanning complete");

          openSarifViewerPannel(path.join(workspaceFolder.uri.fsPath, '.reposhield', 'nuclei', 'results.sarif'));
        }
      );
    }
  );

  const disposableSettings = vscode.commands.registerCommand('reposhield.settings', async () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'reposhield');
  });

  context.subscriptions.push(disposableDynamic);
  context.subscriptions.push(disposableDiffProcesses);
  context.subscriptions.push(disposableDiffFilesystem);
  context.subscriptions.push(disposableReadLog);
  context.subscriptions.push(disposableFolderScan);
  context.subscriptions.push(disposableNuclei);
  context.subscriptions.push(disposableSettings);
}

async function openSarifViewerPannel(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`The file at path "${filePath}" was not found.`);
      return false;
    }

    const sarifExt = vscode.extensions.getExtension(
      "MS-SarifVSCode.sarif-viewer"
    );
    if (sarifExt === undefined) {
      vscode.window
        .showWarningMessage(
          "Please install 'Sarif Viewer' to view SAST report better.",
          ...["Install"]
        )
        .then((install) => {
          if (install === "Install") {
            vscode.commands.executeCommand(
              "workbench.extensions.installExtension",
              "MS-SarifVSCode.sarif-viewer"
            );
          }
        });
      return false;
    }
    if (!sarifExt.isActive) await sarifExt.activate();
    await sarifExt.exports.openLogs([vscode.Uri.file(filePath)]);
  } catch (err) {
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

// This method is called when your extension is deactivated
export async function deactivate() { }
