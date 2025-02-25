import * as path from "path";
import * as fs from "fs";
import * as vscode from 'vscode';

export async function replaceCarriageReturnsInFolder(folderPath: string) {
  try {
    // Get the list of files in the folder
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);

      // Check if the file is a regular file (not a directory)
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        await replaceCarriageReturnsInFile(filePath);
      } else if (stat.isDirectory()) {
        // Recursively process subdirectories
        await replaceCarriageReturnsInFolder(filePath);
      }
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error reading folder: ${error.message}`);
  }
  console.log("Done replacing CRLF.");
}

async function replaceCarriageReturnsInFile(filePath: string) {
  try {
    // Open the file and read its content
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Replace all \r\n with \n
    const updatedContent = fileContent.replace(/\r\n/g, '\n');

    // If there is any change, write the content back to the file
    if (fileContent !== updatedContent) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      vscode.window.showInformationMessage(`Updated file: ${filePath}`);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error processing file: ${filePath} - ${error.message}`);
  }
}

export async function generateNucleiTemplates(
  templateDirectory: string,
  endpointFile: string
) {
  // open endpointFile and parse json
  // for each endpoint, generate nuclei template
  const data = fs.readFileSync(endpointFile, "utf8");
  const endpoints = JSON.parse(data);
  const paths = endpoints.routes;

  // write line separated params to file names {path}.txt
  for (const p of paths) {
    const pFilename = p.path.replace(/\//g, "_").replace(/:/g, "_");
    const params = p.params;
    const paramsFile = path.join(templateDirectory, "../payloads", `${pFilename}.txt`);
    const paramsStr = params.join("\n");
    fs.writeFileSync(paramsFile, paramsStr);

    // create nuclei template from base template
    // loop through all files in base_templates directory and replace all ||path|| with path

    for (const file of fs.readdirSync(
      path.join(templateDirectory, "../base_templates")
    )) {
      if (!file.endsWith(".yaml")) {
        continue;
      }
      const baseTemplate = fs.readFileSync(
        path.join(templateDirectory, "../base_templates", file),
        "utf8"
      );
      //   const template = baseTemplate.replace("||path||", p);
      let template = baseTemplate.replace(
        new RegExp("\\|\\|path\\|\\|", "g"),
        p.path
      );
      template = template.replace(
        "||pathfile||",
        pFilename
      );
      // create new filename <original_filename>_<p>.yaml
      const newFilename = file.replace(".yaml", `-${pFilename}.yaml`);
      const newFile = path.join(templateDirectory, newFilename);
      fs.writeFileSync(newFile, template);
    }
  }

  await replaceCarriageReturnsInFolder(path.join(templateDirectory, "../payloads"));
  await replaceCarriageReturnsInFolder(templateDirectory);

}
