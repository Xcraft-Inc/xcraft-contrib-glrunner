var path = require('path')
  , os = require('os')
  , isWin = os.platform() === 'win32'

module.exports = function(parsed) {
  var o = {}
  if (parsed.url) o.url = parsed.url
  if (parsed.token) o.token = parsed.token
  if (parsed.buildDir) o.buildDir = parsed.buildDir
  if (parsed.npm) o.npm = parsed.npm
  if (parsed.timeout) o.timeout = parsed.timeout
  o.keypath = parsed.keypath
    ? parsed.key
    : isWin
    ? path.join(process.env.USERPROFILE, '.ssh', 'gcr')
    : path.join(process.env.HOME, '.ssh', 'gcr')
  o.loglevel = parsed.loglevel || 'info'
  o.strictSSL = parsed.hasOwnProperty('strictSSL')
              ? parsed.strictSSL
              : true
  return o
}
