// DOMStringMap keys are an external contract, including aliases accessed through
// a local variable (data.openThread), rather than directly through .dataset.
function collectDatasetProperties(sources) {
  return [...new Set(sources.flatMap(source => [
    ...[...source.matchAll(/\.dataset\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]),
    ...[...source.matchAll(/\bdata-([a-z][a-z0-9-]*)/g)].map(match => match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())),
  ]))];
}
module.exports = { collectDatasetProperties };
