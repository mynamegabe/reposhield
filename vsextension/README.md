
## Setup for vs code extension development

```
npm install --global yo generator-code

yo code
```

Upon installing the extension, there will be a new icon at the left activity bar of vs code, use that to run a scan on the workspace.

You can also `read logs` after running a codeql scan.

## Scan workspace
Scans the workspace using **CodeQL**. Currently is only checks for empty try/except blocks in python. It should be modified to scan a range of programming languages and scan using custom/predefined query packs.

The custom query packs are placed under the `/queries` folder. Right now it runs a predefined query pack called `codeql/python-queries`.

We can modify the database analysis to run our custom query as well, but need to modify in `extension.ts`.

To view predefined query packs, refer to the `CodeQL Query packs` section of this README.

## Read Log
Reads the logs using `Sarif Reader` vscode extension.

Logs have to be generated first by running `Scan workspace`.

## Run dynamic analysis
Builds a docker container as a sandboxing method. Right now it gets cpu and ram usage after executing the web application. Need to output way more information on these.

One huge disadvantage of this method is that it uses up 3GB of space just for one container. (may need to remove the container after running so to save space).

Another huge disadvantage is that it requires the user to have docker installed, which won't always be the case.

It also does a simple fuzzing of endpoints right now, which outputs the statuscode to the report (report is found in .reposhield/report after running successfully).

The requirements for executing the dynamic analysis is to change the environment variables during the running of the docker container (look at `cmd.ts` under `runDocker` function).

The values to set these env vars can be defined with the help of LLM.
- **EXECMD**: command to run to start the web application
- **APPPORT**: port number that the application would run on
- **ENDPOINTS**: endpoints of the web app, delimited by ','
- **LANGUAGE**: programming language used for the base application (need to figure out how to do it for multiple languages)

### CodeQL Query packs
https://github.com/advanced-security/awesome-codeql?tab=readme-ov-file
https://github.com/orgs/codeql/packages?tab=packages&q=javascript

## CodeQL Queries

Under the `/queries` folder, you will find a test.ql, this query is used for finding empty `try/except` blocks in python.

The `qlpack.yml` is a requirement to aid in the installation of the query pack (e.g. import python/cpp/javascript/typescript etc.)
- Change the dependencies to install the packs needed.
- To install the query pack, use cli and enter the directory with the `qlpack.yml`, then run `codeql pack install`.

We can then run the query in the database analysis: `codeql database analyze <db_dir> .\test.ql --format=sarifv2.1.0 --output=results.sarif`

This `.sarif` file can then be opened in sarif viewer (vscode extension).


### Code reference

https://github.com/codeql-agent-project/codeql-agent-docker/blob/main/Dockerfile