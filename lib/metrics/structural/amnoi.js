import { once } from 'events';
import { setImmediate } from 'timers/promises';
import _ from 'lodash';
import { calculateChunk, concatMaps, safeDiv } from './utils.js';

export default async function computeAMNOI() {
  const chunkSize = calculateChunk(this.modules.size, this.constructor.pool.threads.length);

  const chunkedModules = _.chunk([...this.modules], chunkSize);

  let jobs = [];
  for (let i = 0; i < chunkedModules.length; i++) {
    if (this.constructor.pool.queueSize == this.constructor.pool.options.maxQueue) {
      await once(this.constructor.pool, 'drain');
    }
    // awaits till the next cycle
    // ensures a little of fairness among the managers putting their jobs to be executed
    // in the pool
    if (i != 0 && i % this.constructor.pool.threads.length === 0) {
      await setImmediate();
    }

    jobs.push(this.constructor.pool.run({ configFilePath: this.projectConfig.project.getCompilerOptions().configFilePath, chunkedModule: chunkedModules[i] }, { name: 'computeAMNOI' }));
  }

  let modulesResults = await Promise.all(jobs);
  // concat all the maps provided by the workers in the pool
  modulesResults = concatMaps(modulesResults);

  // calculate the metrics for all the modules
  let indexes = 0;
  for (let moduleResult of modulesResults.values()) {
    indexes += moduleResult.analysisResult.index;
  }

  return {
    projectName: this.projectConfig.name,
    metric: 'AMNOI',
    analysisResult: {
      index: safeDiv(indexes, modulesResults.size)
    },
    modules: modulesResults
  };
}