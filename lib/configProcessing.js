import { readFile } from 'fs/promises';
import { Project } from "ts-morph";

function processSourceFiles(projectInfo, project) {
  let sourceFiles;
  if (Array.isArray(projectInfo.files)) {
    let files = projectInfo.files.filter(file => typeof file === 'string' && file !== '');
    if (files.length > 0) {
      sourceFiles = project.getSourceFiles(files);
    }
  } if (typeof projectInfo.files === 'string') {
    if (projectInfo.files !== '') {
      sourceFiles = project.getSourceFiles(projectInfo.files);
    }
  } else {
    throw new Error("Type of source files property not recognized!");
  }
  return sourceFiles;
}

function processConfigObjects(projectInfo) {
  const project = new Project({
    tsConfigFilePath: projectInfo.tsConfigFilePath
  });
  const sourceFiles = processSourceFiles(projectInfo, project);
  if (project && sourceFiles) {
    return { ...projectInfo, project, sourceFiles };
  }
}

export default async function (configFilePath) {
  const rawJSON = await readFile(configFilePath);
  const configFile = JSON.parse(rawJSON);

  if (Array.isArray(configFile)) { //multiple projects
    return configFile.map(projectInfo => processConfigObjects(projectInfo));
  } else if (typeof configFile === 'object' && configFile !== null) {
    return processConfigObjects(configFile);
  } else {
    throw new Error("Type of value supplied for the configuration is not accepted or recognized!");
  }
}