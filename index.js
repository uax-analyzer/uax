import { Command } from 'commander';
import path from 'path';
import { Node } from "ts-morph";

import processConfigFile from './lib/configProcessing.js';

import { computeAMNOI, computeAPXI } from "./lib/metrics/structural/index.js";
import { getYoutubeLikeToDisplay } from './lib/metrics/structural/util.js';

const program = new Command();

program
  //.command('path')
  //.description('Analyze the usability of JavaScript packages')
  //.argument('<string>', 'path pointing to configuration files')
  .requiredOption('-p, --path <dir>', 'the path pointing to configuration files')
  .parse();

const configFilePath = program.opts().path;
if (path.extname(configFilePath) != ".json") {
  throw new Error("Configuration file must be a JSON file!");
}

let projects = await processConfigFile(configFilePath);

const mainFile = projects.sourceFiles;

let modules = new Map();
let modulePath, declarationsMap;
for (const [name, declarations] of mainFile[0].getExportedDeclarations()) {
  declarations.forEach(declaration => {
    if (Node.isClassDeclaration(declaration) || Node.isFunctionDeclaration(declaration)) {
      modulePath = path.relative(projects.tsConfigFilePath, declaration.getSourceFile().getFilePath());

      if (!modules.has(modulePath)) {
        modules.set(modulePath, new Map());
      }
      declarationsMap = modules.get(modulePath);

      if (!declarationsMap.has(name)) {
        declarationsMap.set(name, []);
      }
      let decs = declarationsMap.get(name);
      decs.push(declaration);

    }
  });
}


let res = await Promise.all([computeAMNOI(modules), computeAPXI(modules)]);
console.log(res[0].index, res[1].index);
