import { once } from 'events';
import _ from 'lodash';
import { calculateChunk } from './utils.js';
import { reduceComplexities, calculateAPXI } from './tasks/apxi/utils.js';

export default async function computeAPXI(maxParamNumber = 4) {
  const chunkSize = calculateChunk(this.modules.size, this.constructor.pool.threads.length);

  const chunkedModules = _.chunk([...this.modules], chunkSize);

  const jobs = [];
  for (let i = 0; i < chunkedModules.length; i++) {
    // Checks if there's space on the pool's queue. Othewise, awaits.
    if (this.constructor.pool.queueSize == this.constructor.pool.options.maxQueue) {
      await once(this.constructor.pool, 'drain');
    }

    jobs.push(this.constructor.pool.run({ configFilePath: this.projectConfig.tsProject.getCompilerOptions().configFilePath, chunkedModule: chunkedModules[i], maxParamNumber }, { name: 'computeAPXI' }));
  }

  let modulesResults = await Promise.all(jobs);
  // concat all the objects provided by the workers in the pool
  modulesResults = modulesResults.reduce((prev, curr) => Object.assign(prev, curr), {});

  // calculate the metrics for all the modules
  const paramLengthComplexities = [], paramSequenceComplexities = [];
  for (let { usability } of Object.values(modulesResults)) {
    paramLengthComplexities.push(usability.paramLengthComplexity);
    paramSequenceComplexities.push(usability.paramSequenceComplexity);
  }

  const paramLengthComplexity = reduceComplexities(paramLengthComplexities);
  const paramSequenceComplexity = reduceComplexities(paramSequenceComplexities);

  return {
    projectName: this.projectConfig.name,
    metricName: 'APXI',
    usability: {
      paramLengthComplexity, paramSequenceComplexity,
      score: calculateAPXI(paramLengthComplexity, paramSequenceComplexity),
    },
    modules: modulesResults
  };
}