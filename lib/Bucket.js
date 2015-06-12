"use strict";

var debug     = require('debug')('ct:bucket');
var couchbase = require('couchbase');
var util      = require('util');

var Source    = require('./Source.js');

function Bucket(opts, models, callback) {
  Source.apply(this, arguments);
  this._opts = opts;
  this._cluster = new couchbase.Cluster(opts.url);
  this._bucket = this._cluster.openBucket(opts.bucket, opts.password, callback);
}
util.inherits(Bucket, Source);

/************************** atomic setters **************************/

function async_map(items, func, callback) {
  var flag = false;
  var results = {};
  var length = Object.keys(items).length;

  var step = function(key, err, result) {
    length--;
    results[key] = result;
    if (err && !flag) {
      flag = true;
      err.key = key;
      callback(err);
    } else if (length <= 0 && !flag) {
      flag = true;
      callback(null, results);
    }
  };
  for (var idx in items) {
    var key = items[idx]._key;
    var cab = step.bind(null, key);
    func(items[idx], idx, cab);
  }
}

/* Updated items with res from _add/_get and sanitize Items collection */
Bucket.prototype._acks_to_items = function(items, err, res, callback) {
  if (err === 0)
    err = null;
  // Ignore 4101 A.K.A "At least one of your operations failed"
  if (err && err.code == 4101)
    err = null;
  // err is the count of errors in res
  if (err && parseInt(err) === err)
    err = null;
  // Error or no results, stop here
  if (err || !res)
    return callback(err, items);
  // This happens sometimes
  if (res[undefined])
    return callback(res[undefined].error, items);

  for (var idx in items) {
    var key = items[idx]._key;
    if (res[key].error) {
      // Log object own errors
      err = err || new Error('Database operation failed');
      err.errors = err.errors || [];
      res[key].error.key = key;
      err.errors.push(res[key].error);
    } else {
      // Update item metas
      util._extend(items[idx]._meta, res[key]);
    }
  }
  callback(err, items);
};

Bucket.prototype._add = function(items, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype._add');
  if (items && !Object.keys(items).length) return callback();

  async_map(items, function(item, idx, done) {
    var _opts = util._extend({}, opts);
    util._extend(_opts, item._meta);
    self._bucket.insert(item._key, item, _opts, done);
  }, function(err, res) {
    debug('+ Bucket.prototype._add:done');
    self._acks_to_items(items, err, res, callback);
  });
};

Bucket.prototype._set = function(items, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype._set');
  if (items && !Object.keys(items).length) return callback();

  async_map(items, function(item, idx, done) {
    var _opts = util._extend({}, opts);
    util._extend(_opts, item._meta);
    self._bucket.upsert(item._key, item, _opts, done);
  }, function(err, res) {
    debug('+ Bucket.prototype._set:done');
    self._acks_to_items(items, err, res, callback);
  });
};

/************************** atomic getters **************************/

Bucket.prototype._make_collection = function() {
  var items = {};
  Object.defineProperty(items, 'keys', {
    enumerable: false,
    get: function() { return Object.keys(this); }
  });
  Object.defineProperty(items, 'size', {
    enumerable: false,
    get: function() { return Object.keys(this).length; }
  });
  Object.defineProperty(items, 'map', {
    enumerable: false,
    value: function (func) {
      items.keys.map(function(key) { func(items[key]); });
    }
  });
  return items;
};

Bucket.prototype._docs_to_items = function(keys, err, res, callback) {
  var items = this._make_collection();
  if (err === 0)
    err = null;
  // Ignore 4101 A.K.A "At least one of your operations failed"
  if (err && err.code == 4101)
    err = null;
  // err is the count of errors in res
  if (err && parseInt(err) === err)
    err = null;
  // Error or no results, stop here
  if (err || !res)
    return callback(err, items);
  // This happens sometimes
  if (res[undefined])
    return callback(res[undefined].error, items);

  for (var idx in keys) {
    var key = keys[idx];
    if (res[key].error && res[key].error.code !== 13) {
      // Log object own errors
      // Log object own errors
      err = err || new Error('Database operation failed');
      err.errors = err.errors || [];
      res[key].error.key = key;
      err.errors.push(res[key].error);
    } else if (res[key].value){
      // Documents to Item
      var doc = res[key].value || {};
      var meta = {cas: res[key].cas, flags: res[key].flags};
      items[key] = this.new(doc.type, key, doc, meta);
    }
  }
  callback(err, items);
};

Bucket.prototype._get = function(keys, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype._get');// [%s]', keys);
  if (!keys || !keys.length)
    return callback(null, self._make_collection());
  self._bucket.getMulti(keys, function(err, res) {
    debug('+ Bucket.prototype._get:done');// [%s]', keys);
    self._docs_to_items(keys, err, res, callback);
  });
};

Bucket.prototype._lock = function(keys, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype._lock'); // [%s]', keys);
  if (!keys || !keys.length) return callback();

  async_map(keys, function(key, idx, done) {
    self._bucket.getAndLock(key, opts, done);
  }, function(err, res) {
    debug('+ Bucket.prototype._lock:done'); // [%s]', keys);
    self._docs_to_items(keys, err, res, callback);
  });
};

/************************** atomic misc **************************/

Bucket.prototype._items_to_cass = function(items) {
  var cass = {};
  for (var idx in items) {
    var item = items[idx];
    cass[item._key] = {cas: item._meta.cas};
  }
  return cass;
};

Bucket.prototype._del = function(items, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype._del');

  async_map(items, function(item, idx, done) {
    var _opts = util._extend({}, opts);
    util._extend(_opts, item._meta);
    self._bucket.remove(item._key, _opts, done);
  }, function(err, res) {
    debug('+ Bucket.prototype._del:done');
    callback(err);
  });
};


Bucket.prototype._unlock = function(items, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype.unlock');
  async_map(items, function(item, idx, done) {
    var _opts = util._extend({}, opts);
    util._extend(_opts, item._meta);
    self._bucket.remove(item._key, _opts, done);
  }, function(err, res) {
    debug('+ Bucket.prototype.unlock:done');
    callback(err);
  });
};

/*************************** views ***************************/
Bucket.prototype._escape_view_opts = function (opts) {
  opts = util._extend({}, opts);
  if (typeof(opts.startkey) !== 'undefined')
    opts.startkey = JSON.stringify(opts.startkey);
  if (typeof(opts.endkey) !== 'undefined')
    opts.endkey = JSON.stringify(opts.endkey);
  if (typeof(opts.key) !== 'undefined')
    opts.key = JSON.stringify(opts.key);
  if (typeof(opts.keys) !== 'undefined')
    opts.keys = JSON.stringify(opts.keys);
  return opts;
};

Bucket.prototype._view = function(ddoc, view, opts, callback) {
  debug('+ Bucket.prototype._view("%s/%s")', ddoc, view);

  var query = couchbase.ViewQuery.from(ddoc, view);
  query.options = this._escape_view_opts(opts);
  this._bucket.query(query, function(e,a,m) {
    debug('+ Bucket.prototype._view("%s/%s"):done', ddoc, view);
    callback(e,a,m);
  });
};

/*************************************************************
 * Glimpse expect a _count reduce function to exists within
 * the view. And will use it to return the total number of
 * rows matching opts.
 * It will then inject this result (if computed) as the
 * total_rows meta result of a plain _view query;
 */
Bucket.prototype._glimpse = function(ddoc, view, opts, callback) {
  debug('+ Bucket.prototype._glimpse');
  var self = this;

  // if (!opts.key && !opts.keys && !opts.startkey && !opts.endkey)
    // return callback(null, null, null);

  opts = util._extend({}, opts);
  // Modify view opts for _count reduce
  delete opts.group;
  delete opts.group_level;
  delete opts.skip;
  delete opts.limit;
  opts.reduce       = true;
  opts.group_level  = 0;
  opts.include_docs = false;
  if (opts.keys)
    opts.group = true;

  self._view(ddoc, view, opts, function(err, res, meta) {
    debug('+ Bucket.prototype._glimpse:done');
    if (err || !res) { return callback(err); }
    meta = {total_rows: parseInt((res[0]||{value: 0}).value)};
    callback(err, null, meta);
  });
};


Bucket.prototype.glimpse = function(ddoc, view, opts, callback) {
  debug('+ Bucket.prototype.glimpse');
  var self = this;

  self._glimpse(ddoc, view, opts, function(err, res, _meta) {
    self._view(ddoc, view, opts, function(err, res, meta) {
      callback(err, res, _meta || meta);
    });
  });
};

/*************************************************************
 * Gaze gets documents ids from a view result and get_multi it
 */
Bucket.prototype._gaze = function(ddoc, view, opts, callback) {
  debug('+ Bucket.prototype._gaze');
  var self = this;

  // Enforce non-reduceness
  opts.reduce = false;
  // Call the view
  self._view(ddoc, view, opts, function(err, res, meta) {
    debug('+ Bucket.prototype._gaze:done');
    if (err || !res || !res.length)
      return callback(err, self._make_collection());
    var keys = res.map(function(e) { return e.id; });
    self._get(keys, {}, function(err, items) {
      callback(err, items, meta);
    });
  });
};

Bucket.prototype.gaze = function(ddoc, view, opts, callback) {
  var self = this;
  debug('+ Bucket.prototype.gaze');

  self._glimpse(ddoc, view, opts, function(err, res, _meta) {
    self._gaze(ddoc, view, opts, function(err, res, meta) {
      callback(err, res, _meta || meta);
    });
  });
};

/************************* others ****************************/

Bucket.prototype.shutdown = function() {
  this._bucket.disconnect.apply(this._bucket, arguments);
};


module.exports = Bucket;
