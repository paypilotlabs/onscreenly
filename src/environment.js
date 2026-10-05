// A present canonical variable wins, including an explicit empty string or "0".
// Return the raw value so each existing feature keeps its own flag semantics.
function readEnvironment(name, environment = process.env) {
  const canonical = 'ONSCREENLY_' + name;
  return Object.prototype.hasOwnProperty.call(environment, canonical)
    ? environment[canonical]
    : environment['CUE_' + name];
}

module.exports = { readEnvironment };
