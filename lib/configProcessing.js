import { readFile } from 'fs/promises';
import { Project } from "ts-morph";
import path from 'path';

function processSourceFiles(tsProject, sourceFilePath) {
  let sourceFile;
  if (typeof sourceFilePath === 'string') {
    if (sourceFilePath !== '') {
      sourceFile = tsProject.getSourceFile(sourceFilePath);
    }
  } else {
    throw new Error("Type of source file path not recognized!");
  }
  return sourceFile;
}

function processConfigObjects(projectInfo) {
  const tsProject = new Project({
    tsConfigFilePath: projectInfo.tsConfigFilePath
  });
  const sourceFile = processSourceFiles(tsProject, projectInfo.sourceFilePath);

  if (tsProject && sourceFile) {
    // if user set a custom name for the project to be analyzed
    if (projectInfo.name && projectInfo.name !== '') {
      return { ...projectInfo, tsProject, sourceFile };
    }
    const name = path.basename(tsProject.getCompilerOptions().baseUrl || projectInfo.basePath);
    return { ...projectInfo, name, tsProject, sourceFile };
  }
}

export default async function (configFilePath) {
  const rawJSON = await readFile(configFilePath);
  const configFileContent = JSON.parse(rawJSON);

  if (Array.isArray(configFileContent)) { //multiple projects
    return configFileContent.map(projectInfo => processConfigObjects(projectInfo));
  } else if (typeof configFileContent === 'object' && configFileContent !== null) {
    return [processConfigObjects(configFileContent)];
  } else {
    throw new Error("Type of value supplied for the configuration is not accepted or recognized!");
  }
}