import path from 'path';
import util from 'util';
import fs from 'fs';
import { exec } from 'child_process';
const execP = util.promisify(exec);

import { Command } from 'commander';
import { merge } from 'rxjs';

// local imports
import processConfigFile from './lib/configProcessing.js';
import createManager from './lib/metrics/structural/manager.js';

const OUTPUT_DIR = './output/';
// Cleans the output folder and recreate it
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmdirSync(OUTPUT_DIR, { recursive: true });
}
fs.mkdirSync(OUTPUT_DIR);

const program = new Command();

program
  .requiredOption('-p, --path <dir>', 'the path pointing to configuration files')
  .parse();

const configFilePath = program.opts().path;
if (path.extname(configFilePath) != ".json") {
  throw new Error("Configuration file must be a JSON file!");
}

const projects = await processConfigFile(configFilePath);

const managers = projects.map(project => createManager(project));

//install all projects' dependencies
console.log("Installing projects' dependencies...")
for (let manager of managers) {
  try {
    await execP(`cd ${manager.projectConfig.basePath} && npm install`);
  } catch (e) { }
  let { error } = await execP(`cd ${manager.projectConfig.basePath} && npm install type-plus`);
  if (error) {
    console.error(error);
    process.exit();
  }
}

console.log("Initializing metrics processing...")
merge(...managers.map(manager => manager.computeMetricsAsObservable()))
  .subscribe({
    next: data => {
      fs.writeFile(path.join(OUTPUT_DIR, `${data.projectName + ' - ' + data.metric}.json`),
        JSON.stringify(data), 'utf8', (err) => {
          if (err) {
            console.error(err);
            process.exit();
          }
        })
    },
    error: err => console.error("An error happened during the processing:\n" + err),
    complete: _ => console.log("Operation completed successfully!\nResults available at:" + OUTPUT_DIR)
  });
