import { once } from 'events';
import _ from 'lodash';
import { calculateChunk, safeDiv } from './utils.js';

export default async function computeAMNOI() {
  const chunkSize = calculateChunk(this.modules.size, this.constructor.pool.threads.length);

  const chunkedModules = _.chunk([...this.modules], chunkSize);

  const jobs = [];
  for (let i = 0; i < chunkedModules.length; i++) {
    // Checks if there's space on the pool's queue. Othewise, awaits.
    if (this.constructor.pool.queueSize == this.constructor.pool.options.maxQueue) {
      await once(this.constructor.pool, 'drain');
    }

    jobs.push(this.constructor.pool.run({ configFilePath: this.projectConfig.project.getCompilerOptions().configFilePath, chunkedModule: chunkedModules[i] }, { name: 'computeAMNOI' }));
  }

  let modulesResults = await Promise.all(jobs);
  // concat all the objects provided by the workers in the pool
  modulesResults = modulesResults.reduce((prev, curr) => Object.assign(prev, curr), {});

  // calculate the metrics for all the modules
  let indexes = 0;
  for (let { usabilityResult } of Object.values(modulesResults)) {
    indexes += usabilityResult.index;
  }

  return {
    projectName: this.projectConfig.name,
    metric: 'AMNOI',
    usabilityResult: {
      index: safeDiv(indexes, modulesResults.size)
    },
    modules: modulesResults
  };
}