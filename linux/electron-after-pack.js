'use strict';

const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const publicExecutable = path.join(context.appOutDir, 'waifux-linux');
  const internalExecutable = path.join(context.appOutDir, 'waifux-linux-bin');

  if (!fs.existsSync(publicExecutable)) {
    return;
  }

  fs.renameSync(publicExecutable, internalExecutable);
  fs.writeFileSync(
    publicExecutable,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'unset ELECTRON_RUN_AS_NODE',
      'HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      'exec "$HERE/waifux-linux-bin" "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
};
