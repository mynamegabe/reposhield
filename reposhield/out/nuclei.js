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
exports.replaceCarriageReturnsInFolder = replaceCarriageReturnsInFolder;
exports.generateNucleiTemplates = generateNucleiTemplates;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
async function replaceCarriageReturnsInFolder(folderPath) {
    try {
        // Get the list of files in the folder
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            // Check if the file is a regular file (not a directory)
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                await replaceCarriageReturnsInFile(filePath);
            }
            else if (stat.isDirectory()) {
                // Recursively process subdirectories
                await replaceCarriageReturnsInFolder(filePath);
            }
        }
    }
    catch (error) {
        vscode.window.showErrorMessage(`Error reading folder: ${error.message}`);
    }
    console.log("Done replacing CRLF.");
}
async function replaceCarriageReturnsInFile(filePath) {
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
    }
    catch (error) {
        vscode.window.showErrorMessage(`Error processing file: ${filePath} - ${error.message}`);
    }
}
async function generateNucleiTemplates(templateDirectory, endpointFile) {
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
        for (const file of fs.readdirSync(path.join(templateDirectory, "../base_templates"))) {
            if (!file.endsWith(".yaml")) {
                continue;
            }
            const baseTemplate = fs.readFileSync(path.join(templateDirectory, "../base_templates", file), "utf8");
            //   const template = baseTemplate.replace("||path||", p);
            let template = baseTemplate.replace(new RegExp("\\|\\|path\\|\\|", "g"), p.path);
            template = template.replace("||pathfile||", pFilename);
            // create new filename <original_filename>_<p>.yaml
            const newFilename = file.replace(".yaml", `-${pFilename}.yaml`);
            const newFile = path.join(templateDirectory, newFilename);
            fs.writeFileSync(newFile, template);
        }
    }
    await replaceCarriageReturnsInFolder(path.join(templateDirectory, "../payloads"));
    await replaceCarriageReturnsInFolder(templateDirectory);
}
//# sourceMappingURL=nuclei.js.map