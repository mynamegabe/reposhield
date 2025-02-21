
## Setup for vs code extension development

```
npm install --global yo generator-code

yo code
```

Upon installing the extension, there will be a new icon at the left activity bar of vs code, use that to run a scan on the workspace.


## CodeQL Query packs

https://github.com/advanced-security/awesome-codeql?tab=readme-ov-file
https://github.com/orgs/codeql/packages?tab=packages&q=javascript


## CodeQL Queries

Under the `/queries` folder, you will find a test.ql, this query is used for finding empty `try/except` blocks in python.

The `qlpack.yml` is a requirement to aid in the installation of the query pack (e.g. import python/cpp/javascript/typescript etc.)
- Change the dependencies to install the packs needed.
- To install the query pack, use cli and enter the directory with the `qlpack.yml`, then run `codeql pack install`.

We can then run the query in the database analysis: `codeql database analyze <db_dir> .\test.ql --format=sarifv2.1.0 --output=results.sarif`

This `.sarif` file can then be opened in sarif viewer (vscode extension).
