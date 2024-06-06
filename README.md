# UAX.js

UAX.js is a tool built to implement and provide easy access to API usability metrics. The tool is contructed in JavaScript and primarily aims to measure API usability of TypeScript APIs. We believe that UAX has the potential to help API designers to better plan the design and construction process of APIs by providing the easy access to usability metrics, something that has been lacking in the field. Also, the tool may better support the software engineering process before the API even get released; this way, designers can avoid the problematic process of changing the APIs afterwards.

## Requirements
* [Node.js](https://nodejs.org/) v.18 or above

## Installing dependencies
The repository is going to be uploaded at NPM; until then, just `$ git clone` the repository and run, within the tool's root folder, the following command in the terminal, before actually running the tool, to install all the dependencies:

```console
$ npm install
```

## Running

```console
$ node --max-old-space-size=4096 uax --config-path <dir> [--output-path <dir>]
```
where:

* max-old-space-size: A Node.js flag to increase heap memory. 4 GB has shown to be enough for 3 APIs being tested at the same time (execution).
* config-path (short version `-c`): is a path to a configuration JSON.
* output-path (short version `-o`): is an optional parameter indicating a path to an output directory. The defaults is `./output/`.

The configuration JSON has the following schema:
```javascript
{
  "name": String, //an optional name for the API to be analyzed; it defaults to the last part of basePath
  "basePath": String, //the base path of the API repository project (the one with package.json)
  "tsConfigFilePath": String, //the path to the tsconfig.json file
  "sourceFilePath": String //the path to a source file that represents the main entry point of the API to be analyzed (i.e., with the exported constructs of the API)
}
```
In the case of more than one API to be analyzed, the above JSON should be informed as an array of objects (following the above schema).

## Metrics

| Metric        | Abbreviation   | Short Description  |
|:------------- |-------------| ----- |
| API Method Name Overloading Index | AMNOI | It quantifies the degree to which the various overload definitions of a function yield disparate return types. The lesser the metric score, the greater is the number of overloads that return different types |
| API Method Name Confusion Index | AMNCI | It is based on three name-abuse patterns which generates a list of confusing function names. The greater the number of confusing names, the lesser tends to be the metric score |
| API Method Grouping Index | AMGI | It measures the extent to which semantically similar functions are grouped rather than dispersed. The semantic similarity is defined based on keywords extracted from the function names; for instance, functions called `mergeMap` and `concatMap` could be considered semantically similar |
| API Parameter List Consistency Index | APLCI | It assess the consistency in terms of parameter name ordering across functions' definitions |
| API Parameter List Complexity Index | APXI | This metric deals with the length of function parameter and the runs of parameters of the same type. Long lists of parameter and sequences of parameters with the same data type are likely to worsen the user experience |
| API Documentation Index | ADI |  The metric examines the number of words contained in the functions' documentation. It is important to emphasize that the metric is based on a threshold, which defines a minimum number of words (defaults to 50 right now) for every function documentation |

## Output Schema
For every metric, the tool generates a JSON following this name pattern "_**name_of_API - metric_name**_.json" and it has the following schema:

```javascript
{
  "projectName": String,
  "metricName": String,
  "usability": {
    "score": Number //the score of the metric
  }
}
```

## Acknowledge
The implemented metrics are based the following paper:
* _Rama, G. M., & Kak, A. (2015). Some structural measures of API usability. Software: Practice and Experience, 45(1), 75-110._
