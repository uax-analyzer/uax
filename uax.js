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

const program = new Command();

program
  .requiredOption('-c, --config-path <dir>', 'the path pointing to configuration files')
  .option('-o, --output-path <dir>', 'the path where the output files are written', './output/')
  .parse();

const configFilePath = program.opts().configPath;
if (path.extname(configFilePath) != ".json") {
  throw new Error("Configuration file must be a JSON file!");
}

const outputPath = program.opts().outputPath;
// creates folder if it does not exist
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath);
}

const projects = await processConfigFile(configFilePath);

const managers = projects.map(project => createManager(project, ['amnoi']));

//install all projects' dependencies
console.log("Installing projects' dependencies...")
for (const manager of managers) {
  try {
    await execP(`cd ${manager.projectConfig.basePath} && npm install`);
  } catch (e) { } //empty catch since some project were presenting misterious exceptions
  // install type-plus as a dependency for the target project
  let { error } = await execP(`cd ${manager.projectConfig.basePath} && npm install type-plus`);
  if (error) {
    console.error(error);
    process.exit();
  }
}

console.log("Dependencies installed!\nInitializing metrics processing...");

merge(...managers.map(manager => manager.computeMetricsAsObservable()))
  .subscribe({
    next: data => {
      fs.writeFile(path.join(outputPath, `${data.projectName + ' - ' + data.metricName}.json`),
        JSON.stringify(data), 'utf8', (err) => {
          if (err) {
            console.error(err);
            process.exit();
          }
        })
    },
    error: err => console.error("An error happened during the processing:\n" + err),
    complete: _ => console.log("Operation completed successfully!\nResults available at:" + outputPath)
  });
