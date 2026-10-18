// commit-and-tag-version updater for Cargo.toml and Cargo.lock.
// Must be CommonJS: commit-and-tag-version loads updaters with require().
// Only touches the gatestack-core package entry, never dependency versions.

const PACKAGE = "gatestack-core";

// Cargo.toml: the first `version = "..."` line inside [package].
const tomlVersion = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m;

// Cargo.lock: the version line that follows `name = "gatestack-core"`.
const lockVersion = new RegExp(`(name = "${PACKAGE}"\\r?\\nversion = ")([^"]+)(")`);

module.exports.readVersion = function (contents) {
  const toml = contents.match(tomlVersion);
  if (toml) return toml[1];
  const lock = contents.match(lockVersion);
  if (lock) return lock[2];
  throw new Error(`No ${PACKAGE} version found`);
};

module.exports.writeVersion = function (contents, version) {
  if (tomlVersion.test(contents)) {
    return contents.replace(tomlVersion, (match, old) => match.replace(`"${old}"`, `"${version}"`));
  }
  return contents.replace(lockVersion, `$1${version}$3`);
};
