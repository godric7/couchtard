"use strict";

var debug = require('debug')('ct:source');
var util  = require('util');

var Model = require('./Model.js');

function Source(opts, models, callback) {
  this._opts   = opts || {};
  this._models = models || {};
}

/************************** atomic **************************/

Source.prototype.noop = function(arg, opts, callback) {
  callback(null, null);
};
Source.prototype._add = Source.prototype.noop;
Source.prototype._get = Source.prototype.noop;
Source.prototype._set = Source.prototype.noop;
Source.prototype._del = Source.prototype.noop;
Source.prototype._lock   = Source.prototype.noop;
Source.prototype._unlock = Source.prototype.noop;


/************************** factory **************************/

/**
 * Create a new model instance
 */
Source.prototype.new = function(type, key, obj, meta) {
  // If type doesn't exists, use default
  var _model = this._models[type] ? this._models[type] : Model;
  return new _model(this, key, obj, meta);
};

/*************** should be moved somewhere else **************/

function async_map(items, funcname, callback) {
  var flag = false;
  var errors = {};
  var length = Object.keys(items).length;
  var step = function(key, err) {
    length--;
    if (err)
      errors[key] = err.toString();
    if (!length && Object.keys(errors).length)
      callback(new Error(JSON.stringify(errors, null, 2)));
    else if (!length)
      callback(null);
  };
  for (var idx in items) {
    var key = items[idx]._key;
    var cab = step.bind(null, key);
    items[idx][funcname](cab);
  }
}


/**************************** get ****************************/

/**
 * Get multiple model instance
 */
Source.prototype.get_multi = function(keys, opts, callback) {
  debug('+ Source.prototype.get_multi'); // [%s]', keys.k);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this._get(keys, opts, callback);
};

/**
 * Get model instance
 */
Source.prototype.get = function(key, opts, callback) {
  debug('+ Source.prototype.get "%s"', key);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this.get_multi([key], opts, function(err, items) {
    callback(err, items[key]);
  });
};

/**************************** add ****************************/


/**
 * Save from model instance
 */
Source.prototype.add_multi = function(items, opts, callback) {
  var self = this;
  debug('+ Source.prototype.add_multi');
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  async_map(items, 'before_save', function(err, errs) {
    if (err) { return callback(err); }
    async_map(items, 'validate', function(err, errs) {
      if (err) { return callback(err); }
      self._add(items, opts, callback);
    });
  });
};

/**
 * Save one model instance
 */
Source.prototype.add = function(item, opts, callback) {
  debug('+ Source.prototype.add "%s"', item._key);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this.add_multi([item], opts, function(err, items) {
    callback(err, opts, items[0]);
  });
};

/**************************** set ****************************/

/**
 * Save from model instance
 */
Source.prototype.save_multi = function(items, opts, callback) {
  var self = this;
  debug('+ Source.prototype.save_multi');
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  async_map(items, 'before_save', function(err, errs) {
    if (err) { return callback(err); }
    async_map(items, 'validate', function(err, errs) {
      if (err) { return callback(err); }
      self._set(items, opts, callback);
    });
  });
};

/**
 * Get one model instance
 */
Source.prototype.save = function(item, opts, callback) {
  debug('+ Source.prototype.save "%s"', item._key);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this.save_multi([item], opts, function(err, items) {
    var item = (!items || !items.length) ? null : items[0];
    callback(err, item);
  });
};

/**************************** del ****************************/

/**
 * Delete multiple model instances
 */
Source.prototype.delete_multi = function(items, opts, callback) {
  var self = this;
  debug('+ Source.prototype.delete_multi');
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  async_map(items, 'before_delete', function(err, errs) {
    if (err) { return callback(err); }
    self._del(items, opts, callback);
  });
};

/**
 * Delete one model instance
 */
Source.prototype.delete = function(item, opts, callback) {
  debug('+ Source.prototype.delete "%s"', item._key);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this.delete_multi([item], opts, callback);
};

/*************************** lock ****************************/

/**
 * Same as get/get_multi but also locks
 */
Source.prototype.lock_multi = function(keys, opts, callback) {
  debug('+ Source.prototype.lock_multi %s', keys);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this._lock(keys, opts, callback);
};

Source.prototype.lock = function(key, opts, callback) {
  debug('+ Source.prototype.lock "%s"', key);
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this._lock([key], opts, function(err, items) {
    callback(err, items[key]);
  });
};

/************************** unlock ***************************/

Source.prototype.unlock_multi = function(items, opts, callback) {
  debug('+ Source.prototype.unlock_multi');
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this._unlock(items, opts, callback);
};

Source.prototype.unlock = function(item, opts, callback) {
  debug('+ Source.prototype.unlock');
  if (typeof opts == 'function') { callback = opts; opts = {}; }
  this._unlock([item], opts, callback);
};

/**************************** views ****************************/

Source.prototype.view = function(delegate, opts, callback) {
  debug('+ Source.prototype.view');
  delegate(this, opts, callback);
};

/************************** populate **************************/


Source.prototype._populate_pick = function(items, fields) {
  var rkeys = [];
  for (var idx in items) {
    for (var src in fields) {
      // Get keys from src property
      if (items[idx][src] instanceof Array)
        rkeys = rkeys.concat(items[idx][src]);
      else if (typeof items[idx][src] == 'string')
        rkeys.push(items[idx][src]);
    }
  }
  return rkeys;
};

Source.prototype._populate_fill = function(items, fields, rels) {
  var _getr = function(k) { return rels[k]; };
  for (var idx in items) {
    for (var src in fields) {
      var val = null;
      // Select val from rels
      if (items[idx][src] instanceof Array)
        val = items[idx][src].map(_getr);
      else if (typeof items[idx][src] == 'string')
        val = _getr(items[idx][src]);
      // DefineProperty with Val
      Object.defineProperty(items[idx], fields[src], {
        enumerable: false, value: val
      });
    }
  }
  return items;
};

Source.prototype.populate_multi = function(items, fields, callback) {
  var self = this;
  debug('+ Source.prototype.populate_multi %s', fields);
  var rkeys = self._populate_pick(items, fields);
  this.get_multi(rkeys, function(err, rels) {
    self._populate_fill(items, fields, rels);
    callback(err, items);
  });
};

Source.prototype.populate = function(item, fields, callback) {
  debug('+ Source.prototype.populate %s', fields);
  if (!item) { return callback(null, null); }
  this.populate_multi([item], fields, function(err, items) {
    var item = (!items || !items.length) ? null : items[0];
    callback(err, item);
  });
};

module.exports = Source;
