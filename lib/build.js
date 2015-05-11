var gcr = require('./gcr')
  , spawn = require('child_process').spawn
  , rimraf = require('rimraf')
  , slide = require('slide')
  , chain = slide.chain
  , fs = require('fs')
  , log = require('npmlog')
  , path = require('path')
  , util = require('util')
  , mkdirp = require('mkdirp')
  , argsplit = require('argsplit')
  , EE = require('events').EventEmitter

module.exports = Build

function Build(opts) {
  if (!(this instanceof Build))
    return new Build(opts)

  EE.call(this)
  this.git = gcr.config.get('git')
  this.buildDir = gcr.config.get('buildDir')
  opts.commands = opts.commands || []
  opts.timeout = +(gcr.config.get('timeout') || opts.timeout || 5000) * 1000
  this.opts = opts
  this.output = ''
  this.projectDir = path.join(this.buildDir, 'project-'+opts.project_id)
  this.state = 'waiting'
}

util.inherits(Build, EE)

Build.prototype.run = function() {
  this.state = 'running'
  var self = this
  var cmds = this.opts.commands
  var len = cmds.length
  var dir = this.projectDir
  function runCommand(idx) {
    if (idx < len) {
      log.verbose('[build]', 'running command', idx+1, 'of', len)
      var cmd = cmds[idx]
      self.runCommand(cmd, dir, function(err) {
        if (err) return self.emit('done', false)
        runCommand(idx+1)
      })
    } else {
      self.state = 'success'
      self.update(function() {
        self.emit('done', true)
      })
    }
  }
}

Build.prototype.append = function(str) {
  this.output += str
}

Build.prototype.runCommand = function(cmd, dir, cb) {
  var self = this
  if ('function' === typeof dir) cb = dir, dir = process.cwd()
  var env = {
    CI_SERVER: true
  , CI_SERVER_NAME: 'GitLab CI'
  , CI_SERVER_VERSION: null
  , CI_SERVER_REVISION: null
  , CI_BUILD_REF: this.opts.ref
  , CI_BUILD_BEFORE_SHA: this.opts.before_sha
  , CI_BUILD_REF_NAME: this.opts.ref_name
  , CI_BUILD_ID: this.opts.id
  }

  util._extend(env, process.env)

  var opts = {
    env: env
  , cwd: dir
  , timeout: this.opts.timeout
  }

  var fixedCmd = cmd
  if (!Array.isArray(cmd)) {
    fixedCmd = argsplit(cmd)
  }

  log.verbose('[builder]', 'cmd', cmd)
  this.append(util.format('\n%s\n', cmd))

  var child = spawn('/bin/bash', ['-c', fixedCmd.join(' ')], opts)
  var timedout = false
  var timer = setTimeout(function() {
    timedout = true
    child.kill()
    self.append('\n** TIMEOUT **\n')
  }, this.opts.timeout)
  child.stderr.on('data', function(d) {
    var data = d.toString()
    log.silly('[builder]', 'stderr', data)
    self.append(data)
  })
  child.stdout.on('data', function(d) {
    var data = d.toString()
    log.silly('[builder]', 'stdout', data)
    self.append(data)
  })
  child.on('close', function(code) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (code !== 0) {
      var msg = timedout
        ? 'process timedout'
        : 'process exited with code: '+code
      var e = new Error(msg)
      self.append(util.format(
        'Command: [%s] exited with code: %d timedout: %s', cmd, code,
          timedout ? 'yes' : 'no'
      ))
      e.command = cmd
      e.opts = opts
      self.state = 'failed'
      self.update(function() {
        cb && cb(e)
      })
      return
    }
    self.update(function() {
      cb && cb()
    })
  })
}

Build.prototype.update = function(cb) {
  var id = this.opts.id
  gcr.client.updateBuild(id, this.state, this.output, cb)
}
