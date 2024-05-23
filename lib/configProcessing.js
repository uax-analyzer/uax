import { readFile } from 'fs/promises';
import { Project } from "ts-morph";
import path from 'path';

function processSourceFiles(project, sourceFilePath) {
  let sourceFile;
  if (typeof sourceFilePath === 'string') {
    if (sourceFilePath !== '') {
      sourceFile = project.getSourceFile(sourceFilePath);
    }
  } else {
    throw new Error("Type of source file path not recognized!");
  }
  return sourceFile;
}

function processConfigObjects(projectInfo) {
  const project = new Project({
    tsConfigFilePath: projectInfo.tsConfigFilePath
  });
  const sourceFile = processSourceFiles(project, projectInfo.sourceFilePath);

  if (project && sourceFile) {
    if (projectInfo.name && projectInfo.name !== '') {
      return { ...projectInfo, project, sourceFile };
    }
    const name = path.basename(projectInfo.basePath || project.getCompilerOptions().baseUrl);
    return { ...projectInfo, name, project, sourceFile };
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