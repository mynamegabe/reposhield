import * as path from "path";
import * as fs from "fs";

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
    const paramsFile = path.join(templateDirectory, "payloads", `${pFilename}.txt`);
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
}
