'use strict';

const definitions = [
  require('./crm'),
  require('./inventory'),
  require('./job-tracker'),
  require('./finance'),
  require('./doc-assistant'),
];

/** App definitions keyed by their URL segment, e.g. apps['job-tracker']. */
const apps = Object.fromEntries(definitions.map((app) => [app.key, app]));

module.exports = { apps };
